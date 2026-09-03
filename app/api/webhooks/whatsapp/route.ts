import { prisma } from "@/lib/prisma";
import { getPhoneVariants, isGenericWhatsAppName } from "@/lib/utils";
import { bridgeLegacyInboundSafely, bridgeLegacyOutboundSafely } from "@/lib/channels/evolution-bridge";
import { allowWebhookRequest, clientOrigin, correlationId, parseWebhookJson, readRawBody, verifyEvolutionWebhookAuth } from "@/lib/channels/webhook-gateway";
import { createRedisConnection } from "@/lib/queues/connection";

export const runtime = "nodejs";

type EvolutionMessage = {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  pushName?: string;
  verifiedName?: string;
  text?: string;
  content?: string;
  state?: string;
  status?: string;
  message?: string | {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; url?: string };
    documentMessage?: { title?: string; fileName?: string; url?: string };
    audioMessage?: { url?: string };
    videoMessage?: { caption?: string; url?: string };
  };
};

type EvolutionPayload = { event?: string; instance?: string; data?: EvolutionMessage | EvolutionMessage[] };

function response(body: Record<string, unknown>, status: number, correlation: string, retryAfter?: number) {
  const headers: Record<string, string> = { "x-correlation-id": correlation };
  if (retryAfter) headers["retry-after"] = String(retryAfter);
  return Response.json({ ...body, correlation }, { status, headers });
}

function webhookSecret() {
  return process.env.EVOLUTION_WEBHOOK_SECRET || process.env.EVOLUTION_FOUNDATION_WEBHOOK_SECRET;
}

function webhookAuthenticationRequired() {
  return ["staging", "production"].includes(process.env.DEPLOYMENT_ENV || "") || process.env.NODE_ENV === "production";
}

function extractContent(data: EvolutionMessage) {
  const message = data.message;
  if (typeof message === "string") return { content: message, messageType: "TEXT", mediaUrl: null as string | null };
  if (message?.conversation) return { content: message.conversation, messageType: "TEXT", mediaUrl: null };
  if (message?.extendedTextMessage?.text) return { content: message.extendedTextMessage.text, messageType: "TEXT", mediaUrl: null };
  if (message?.imageMessage) return { content: message.imageMessage.caption || "Imagem", messageType: "IMAGE", mediaUrl: message.imageMessage.url || null };
  if (message?.documentMessage) return { content: message.documentMessage.title || message.documentMessage.fileName || "Documento", messageType: "DOCUMENT", mediaUrl: message.documentMessage.url || null };
  if (message?.audioMessage) return { content: "Áudio", messageType: "AUDIO", mediaUrl: message.audioMessage.url || null };
  if (message?.videoMessage) return { content: message.videoMessage.caption || "Vídeo", messageType: "VIDEO", mediaUrl: message.videoMessage.url || null };
  return { content: data.text || data.content || "Mensagem vazia ou tipo não suportado", messageType: "TEXT", mediaUrl: null };
}

async function processMessage(instance: { id: string; name: string; projectId: string }, data: EvolutionMessage) {
  const key = data.key;
  if (!key?.remoteJid) throw new Error("INVALID_MESSAGE_KEY");
  if (key.remoteJid.endsWith("@g.us")) return { status: "IGNORED_GROUP" as const };
  const cleanPhone = key.remoteJid.split("@")[0].replace(/\D/g, "");
  if (!cleanPhone) throw new Error("INVALID_REMOTE_ADDRESS");
  const direction = key.fromMe ? "OUTBOUND" : "INBOUND";

  if (key.id) {
    const duplicate = await prisma.message.findFirst({ where: { remoteId: key.id, conversation: { instanceId: instance.id } }, include: { conversation: true } });
    if (duplicate) {
      if (direction === "INBOUND") await bridgeLegacyInboundSafely({ projectId: instance.projectId, instanceId: instance.id, conversationId: duplicate.conversationId, messageId: duplicate.id });
      else await bridgeLegacyOutboundSafely({ projectId: instance.projectId, messageId: duplicate.id, providerMessageId: key.id, accepted: true });
      return { status: "DUPLICATE" as const, messageId: duplicate.id };
    }
  }

  const phoneVariants = getPhoneVariants(cleanPhone);
  const matchedLead = await prisma.lead.findFirst({ where: { projectId: instance.projectId, phone: { in: phoneVariants } } });
  const pushName = data.pushName || data.verifiedName || null;
  const stablePushName = !isGenericWhatsAppName(pushName, cleanPhone, instance.name) ? pushName : null;
  const fallbackContactName = matchedLead?.name || stablePushName;
  let conversation = await prisma.conversation.findFirst({ where: { instanceId: instance.id, whatsappId: { in: phoneVariants } } });
  if (!conversation && fallbackContactName) {
    conversation = await prisma.conversation.findFirst({ where: { instanceId: instance.id, name: { equals: fallbackContactName, mode: "insensitive" } }, orderBy: { lastMessageAt: "desc" } });
  }
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { whatsappId: cleanPhone, name: fallbackContactName || cleanPhone, instanceId: instance.id, leadId: matchedLead?.id || null } });
  } else {
    const updateData: { lastMessageAt: Date; name?: string; leadId?: string } = { lastMessageAt: new Date() };
    if (fallbackContactName && isGenericWhatsAppName(conversation.name, conversation.whatsappId, instance.name)) updateData.name = fallbackContactName;
    if (!conversation.leadId && matchedLead) updateData.leadId = matchedLead.id;
    conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: updateData });
  }

  const extracted = extractContent(data);
  const message = await prisma.message.create({
    data: { remoteId: key.id, content: extracted.content, direction, status: "DELIVERED", messageType: extracted.messageType, mediaUrl: extracted.mediaUrl, senderName: pushName, conversationId: conversation.id },
  });
  if (conversation.leadId) {
    const excerpt = extracted.content.length > 60 ? `${extracted.content.substring(0, 57)}...` : extracted.content;
    await prisma.activity.create({ data: { leadId: conversation.leadId, type: "LOG", content: `${direction === "INBOUND" ? "Recebido" : "Enviado"} no WhatsApp: "${excerpt}"` } });
  }
  if (direction === "INBOUND") await bridgeLegacyInboundSafely({ projectId: instance.projectId, instanceId: instance.id, conversationId: conversation.id, messageId: message.id });
  else await bridgeLegacyOutboundSafely({ projectId: instance.projectId, messageId: message.id, providerMessageId: key.id || null, accepted: true });
  return { status: "ACCEPTED" as const, messageId: message.id };
}

export async function POST(request: Request) {
  const correlation = correlationId(request);
  const redis = createRedisConnection();
  try {
    const originLimit = await allowWebhookRequest(redis, "evolution-legacy", "origin", clientOrigin(request), Number(process.env.WEBHOOK_RATE_LIMIT_ORIGIN || 120));
    if (!originLimit.allowed) return response({ error: originLimit.code }, originLimit.code === "RATE_LIMITED" ? 429 : 503, correlation, originLimit.retryAfterSeconds);
    const raw = await readRawBody(request);
    const secret = webhookSecret();
    if ((webhookAuthenticationRequired() || secret) && !verifyEvolutionWebhookAuth(raw, request.headers, secret)) return response({ error: "INVALID_SIGNATURE" }, 401, correlation);
    const body = parseWebhookJson<EvolutionPayload>(raw);
    if (!body.instance || typeof body.instance !== "string") return response({ error: "INVALID_INSTANCE" }, 400, correlation);
    const instance = await prisma.whatsAppInstance.findUnique({ where: { instanceName: body.instance }, select: { id: true, name: true, projectId: true } });
    if (!instance) return response({ error: "INSTANCE_NOT_FOUND" }, 404, correlation);
    const connectionLimit = await allowWebhookRequest(redis, "evolution-legacy", "connection", instance.id, Number(process.env.WEBHOOK_RATE_LIMIT_CONNECTION || 600));
    if (!connectionLimit.allowed) return response({ error: connectionLimit.code }, connectionLimit.code === "RATE_LIMITED" ? 429 : 503, correlation, connectionLimit.retryAfterSeconds);

    if (body.event === "connection.update" || body.event === "CONNECTION_UPDATE") {
      const statusData = Array.isArray(body.data) ? body.data[0] : body.data;
      const status = statusData?.state === "open" || statusData?.status === "open" ? "CONNECTED" : "DISCONNECTED";
      await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status } });
      return response({ success: true, status }, 200, correlation);
    }
    if (body.event && !["messages.upsert", "messages.update", "MESSAGES_UPSERT", "MESSAGES_UPDATE"].includes(body.event)) return response({ success: true, status: "IGNORED" }, 200, correlation);
    const records = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    if (records.length === 0 || records.length > 100) return response({ error: "INVALID_MESSAGE_DATA" }, 400, correlation);
    const results = [];
    for (const record of records) results.push(await processMessage(instance, record));
    const duplicates = results.filter((item) => item.status === "DUPLICATE").length;
    return response({ success: true, accepted: results.length - duplicates, duplicates }, 200, correlation);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "BODY_TOO_LARGE") return response({ error: code }, 413, correlation);
    return response({ error: "INVALID_REQUEST" }, 400, correlation);
  } finally {
    await redis.quit().catch(() => undefined);
  }
}
