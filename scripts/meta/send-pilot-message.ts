import { prisma } from "@/lib/prisma";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import { MetaGraphClient } from "@/lib/channels/meta/graph-client";
import { reconcilePendingDeliveryEvents } from "@/lib/channels/meta/processor";

function arg(name: string) { return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
function normalizePhone(value: string) { return value.replace(/\D/g, ""); }

async function main() {
  if (process.env.DEPLOYMENT_ENV !== "staging") throw new Error("META_PILOT_STAGING_ONLY");
  if (process.env.OUTBOUND_INTEGRATIONS_DISABLED !== "true") throw new Error("UNIVERSAL_KILL_SWITCH_MUST_REMAIN_ENABLED");
  if (arg("confirm") !== "SEND_ONE_META_MESSAGE") throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const connectionId = arg("connection-id"); const to = arg("to"); const templateName = arg("template"); const language = arg("language") || "pt_BR";
  if (!connectionId || !to || !templateName) throw new Error("REQUIRED_ARGUMENT_MISSING");
  const normalizedTo = normalizePhone(to);
  const allowlist = new Set((process.env.META_PILOT_ALLOWLIST || "").split(",").map(normalizePhone).filter(Boolean));
  if (!allowlist.has(normalizedTo)) throw new Error("RECIPIENT_NOT_ALLOWLISTED");
  const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, provider: "META_WHATSAPP", isActive: true } });
  if (!connection?.credentialsEncrypted || !connection.externalPhoneNumberId) throw new Error("META_CONNECTION_NOT_READY");
  const template = await prisma.channelTemplate.findFirst({ where: { channelConnectionId: connection.id, name: templateName, language, status: "APPROVED" } });
  if (!template) throw new Error("APPROVED_TEMPLATE_NOT_FOUND");
  const alreadySent = await prisma.auditEvent.count({ where: { projectId: connection.projectId, action: "META_PILOT_MESSAGE_ACCEPTED" } });
  if (alreadySent > 0) throw new Error("META_PILOT_LIMIT_ALREADY_USED");

  const identity = await prisma.contactIdentity.upsert({ where: { channelConnectionId_externalUserId: { channelConnectionId: connection.id, externalUserId: normalizedTo } }, create: { projectId: connection.projectId, channelConnectionId: connection.id, channel: "WHATSAPP", externalUserId: normalizedTo, address: normalizedTo, normalizedAddress: normalizedTo }, update: {} });
  let conversation = await prisma.conversation.findFirst({ where: { channelConnectionId: connection.id, contactIdentityId: identity.id } });
  if (!conversation) conversation = await prisma.conversation.create({ data: { whatsappId: normalizedTo, name: `WhatsApp ***${normalizedTo.slice(-4)}`, projectId: connection.projectId, channelConnectionId: connection.id, contactIdentityId: identity.id, externalConversationId: normalizedTo, channel: "WHATSAPP", status: "OPEN" } });
  const message = await prisma.message.create({ data: { content: `[template:${templateName}:${language}]`, direction: "OUTBOUND", status: "SENDING", messageType: "TEMPLATE", conversationId: conversation.id, projectId: connection.projectId, channelConnectionId: connection.id, idempotencyKey: `meta-pilot:${connection.id}:${normalizedTo}:${templateName}` } });
  try {
    const { accessToken } = decryptChannelCredentials<{ accessToken: string }>(connection.credentialsEncrypted);
    const response = await new MetaGraphClient(accessToken).post<{ messages?: Array<{ id?: string }> }>(`/${encodeURIComponent(connection.externalPhoneNumberId)}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: normalizedTo, type: "template", template: { name: templateName, language: { code: language } } });
    const providerMessageId = response.messages?.[0]?.id;
    if (!providerMessageId) throw new Error("META_SEND_NOT_ACCEPTED");
    await prisma.$transaction([
      prisma.message.update({ where: { id: message.id }, data: { status: "ACCEPTED", providerMessageId, remoteId: providerMessageId, acceptedAt: new Date() } }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: new Date(), lastMessageAt: new Date() } }),
      prisma.contactIdentity.update({ where: { id: identity.id }, data: { lastOutboundAt: new Date() } }),
      prisma.auditEvent.create({ data: { projectId: connection.projectId, action: "META_PILOT_MESSAGE_ACCEPTED", resourceType: "Message", resourceId: message.id, reason: "ONE_SHOT_ALLOWLISTED", metadataRedacted: JSON.stringify({ recipientSuffix: normalizedTo.slice(-4), templateName, language }) } }),
    ]);
    await reconcilePendingDeliveryEvents(connection.id, providerMessageId);
    console.info(JSON.stringify({ status: "ACCEPTED", messageId: message.id, providerMessageIdSuffix: providerMessageId.slice(-8) }));
  } catch (error) {
    await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", failedAt: new Date(), errorCode: error instanceof Error ? error.message.slice(0, 100) : "META_SEND_FAILED" } });
    throw error;
  }
}

main().catch(async (error) => { console.error(JSON.stringify({ status: "FAILED", errorCode: error instanceof Error ? error.message : "UNKNOWN" })); await prisma.$disconnect(); process.exit(1); }).then(async () => prisma.$disconnect());
