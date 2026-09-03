import { prisma } from "@/lib/prisma";
import { assertOutboundAllowed } from "@/lib/outbound-policy";
import { bridgeLegacyOutboundSafely } from "./evolution-bridge";

type SendInput = { projectId: string; conversationId: string; content: string; messageType: string; mediaUrl: string | null };
type SendDependencies = { fetcher?: typeof fetch; apiUrl?: string; globalApiKey?: string; timeoutMs?: number };

function mediaPayload(messageType: string, content: string, mediaUrl: string | null) {
  let mediatype = "document";
  let mimetype = "application/pdf";
  if (messageType === "IMAGE") { mediatype = "image"; mimetype = "image/png"; }
  else if (messageType === "AUDIO") { mediatype = "audio"; mimetype = "audio/mpeg"; }
  else if (messageType === "VIDEO") { mediatype = "video"; mimetype = "video/mp4"; }
  const extension = mediaUrl?.split(".").pop()?.split("?")[0].toLowerCase();
  const mimeByExtension: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", pdf: "application/pdf",
  };
  if (extension && mimeByExtension[extension]) mimetype = mimeByExtension[extension];
  return {
    mediatype,
    mimetype,
    caption: messageType === "IMAGE" ? content : "",
    media: mediaUrl || "",
    fileName: content || (messageType === "IMAGE" ? "imagem.png" : messageType === "AUDIO" ? "audio.mp3" : "documento.pdf"),
  };
}

function failureCode(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "EVOLUTION_TIMEOUT";
  return "EVOLUTION_NETWORK_ERROR";
}

export async function executeEvolutionSend(input: SendInput, dependencies: SendDependencies = {}) {
  assertOutboundAllowed("EVOLUTION", input.messageType === "TEXT" ? "send-text" : "send-media");
  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, include: { instance: true } });
  if (!conversation || !conversation.instance || conversation.instance.projectId !== input.projectId) throw new Error("CONVERSATION_NOT_FOUND");
  if (conversation.instance.type !== "WHATSAPP") throw new Error("EVOLUTION_INSTANCE_INVALID");
  const apiUrl = (dependencies.apiUrl ?? process.env.EVOLUTION_API_URL)?.replace(/\/$/, "");
  const apiKey = conversation.instance.token || dependencies.globalApiKey || process.env.EVOLUTION_API_KEY;
  if (!apiUrl || !apiKey) throw new Error("EVOLUTION_NOT_CONFIGURED");
  if (!input.content.trim()) throw new Error("MESSAGE_CONTENT_REQUIRED");
  if (input.messageType !== "TEXT" && !input.mediaUrl) throw new Error("MESSAGE_MEDIA_REQUIRED");

  const message = await prisma.message.create({
    data: { content: input.content, direction: "OUTBOUND", status: "QUEUED", messageType: input.messageType, mediaUrl: input.mediaUrl, conversationId: conversation.id },
  });
  await prisma.$transaction([
    prisma.message.update({ where: { id: message.id }, data: { status: "SENDING", errorCode: null, errorDetailRedacted: null, failedAt: null } }),
    prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } }),
  ]);

  const cleanPhone = conversation.whatsappId.replace(/\D/g, "");
  const endpoint = input.messageType === "TEXT" ? `/message/sendText/${conversation.instance.instanceName}` : `/message/sendMedia/${conversation.instance.instanceName}`;
  const payload = {
    number: cleanPhone,
    options: { delay: 1000, presence: "composing", linkPreview: false },
    ...(input.messageType === "TEXT" ? { text: input.content } : mediaPayload(input.messageType, input.content, input.mediaUrl)),
  };

  try {
    const response = await (dependencies.fetcher || fetch)(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(dependencies.timeoutMs || 15_000),
    });
    const raw = (await response.text()).slice(0, 65_536);
    let providerMessageId: string | null = null;
    try {
      const decoded = JSON.parse(raw) as { key?: { id?: unknown } };
      if (typeof decoded.key?.id === "string" && decoded.key.id) providerMessageId = decoded.key.id;
    } catch { /* malformed provider bodies are handled as a rejection */ }

    if (!response.ok || !providerMessageId) {
      const errorCode = response.ok ? "EVOLUTION_INVALID_ACCEPTANCE" : `EVOLUTION_HTTP_${response.status}`;
      const failed = await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", failedAt: new Date(), errorCode, errorDetailRedacted: "Evolution did not accept the request." } });
      await bridgeLegacyOutboundSafely({ projectId: input.projectId, messageId: message.id, accepted: false, errorCode });
      return failed;
    }

    const accepted = await prisma.message.update({
      where: { id: message.id },
      data: { status: "ACCEPTED", remoteId: providerMessageId, providerMessageId, acceptedAt: new Date(), errorCode: null, errorDetailRedacted: null, failedAt: null },
    });
    await bridgeLegacyOutboundSafely({ projectId: input.projectId, messageId: message.id, providerMessageId, accepted: true });
    return accepted;
  } catch (error) {
    const errorCode = failureCode(error);
    const failed = await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", failedAt: new Date(), errorCode, errorDetailRedacted: "Evolution request failed before acceptance." } });
    await bridgeLegacyOutboundSafely({ projectId: input.projectId, messageId: message.id, accepted: false, errorCode });
    return failed;
  }
}
