import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptProviderEventPayload } from "@/lib/channels/provider-event-vault";
import { canAdvanceDelivery, metaMessageContent, normalizedDeliveryStatus, type MetaChangeValue } from "./payload";

type StoredChange = { entryId?: string; change?: { field?: string; value?: MetaChangeValue } };

function fromUnix(value?: string) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

export async function reconcilePendingDeliveryEvents(connectionId: string, providerMessageId: string) {
  const message = await prisma.message.findFirst({ where: { channelConnectionId: connectionId, providerMessageId } });
  if (!message) return 0;
  const pending = await prisma.messageDeliveryEvent.findMany({ where: { channelConnectionId: connectionId, providerMessageId, appliedAt: null }, orderBy: { createdAt: "asc" } });
  let applied = 0;
  for (const event of pending) {
    if (!canAdvanceDelivery(message.status, event.providerStatus)) {
      await prisma.messageDeliveryEvent.update({ where: { id: event.id }, data: { messageId: message.id, appliedAt: new Date() } });
      continue;
    }
    const timestamp = event.providerTimestamp || new Date();
    const times = event.providerStatus === "SENT" ? { sentAt: timestamp }
      : event.providerStatus === "DELIVERED" ? { deliveredAt: timestamp }
      : event.providerStatus === "READ" ? { readAt: timestamp }
      : event.providerStatus === "FAILED" ? { failedAt: timestamp }
      : {};
    await prisma.$transaction([
      prisma.message.update({ where: { id: message.id }, data: { status: event.providerStatus, ...times, errorCode: event.errorCode || undefined } }),
      prisma.messageDeliveryEvent.update({ where: { id: event.id }, data: { messageId: message.id, appliedAt: new Date() } }),
    ]);
    message.status = event.providerStatus;
    applied += 1;
  }
  return applied;
}

async function processInbound(eventId: string, connection: { id: string; projectId: string }, value: MetaChangeValue) {
  let created = 0;
  for (const [index, item] of (value.messages || []).entries()) {
    if (!item.id || !item.from) continue;
    const sender = value.contacts?.find((contact) => contact.wa_id === item.from);
    const receivedAt = fromUnix(item.timestamp);
    const parsed = metaMessageContent(item);
    const identity = await prisma.contactIdentity.upsert({
      where: { channelConnectionId_externalUserId: { channelConnectionId: connection.id, externalUserId: item.from } },
      create: { projectId: connection.projectId, channelConnectionId: connection.id, channel: "WHATSAPP", externalUserId: item.from, address: item.from, normalizedAddress: item.from.replace(/\D/g, ""), displayName: sender?.profile?.name, lastInboundAt: receivedAt },
      update: { displayName: sender?.profile?.name || undefined, lastInboundAt: receivedAt },
    });
    let conversation = await prisma.conversation.findFirst({ where: { channelConnectionId: connection.id, contactIdentityId: identity.id } });
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { whatsappId: item.from, name: sender?.profile?.name || item.from, projectId: connection.projectId, channelConnectionId: connection.id, contactIdentityId: identity.id, externalConversationId: item.from, channel: "WHATSAPP", status: "OPEN", lastMessageAt: receivedAt, lastInboundAt: receivedAt, customerCareWindowEndsAt: new Date(receivedAt.getTime() + 86_400_000) } });
    } else {
      conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: { name: sender?.profile?.name || undefined, lastMessageAt: receivedAt, lastInboundAt: receivedAt, customerCareWindowEndsAt: new Date(receivedAt.getTime() + 86_400_000), status: "OPEN" } });
    }
    try {
      await prisma.message.create({ data: { remoteId: item.id, providerMessageId: item.id, content: parsed.content, direction: "INBOUND", status: "DELIVERED", messageType: parsed.type, mediaUrl: parsed.mediaId ? `meta-media:${parsed.mediaId}` : null, conversationId: conversation.id, projectId: connection.projectId, channelConnectionId: connection.id, senderName: sender?.profile?.name, replyToMessageId: null, metadata: JSON.stringify({ providerEventId: eventId, sourceIndex: index, contextProviderMessageId: item.context?.id || null, mediaReferenceOnly: Boolean(parsed.mediaId) }) } });
      created += 1;
      await reconcilePendingDeliveryEvents(connection.id, item.id);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return created;
}

async function processStatuses(eventId: string, connection: { id: string; projectId: string }, value: MetaChangeValue) {
  let recorded = 0;
  for (const [index, item] of (value.statuses || []).entries()) {
    const status = normalizedDeliveryStatus(item.status);
    if (!item.id || !status) continue;
    const externalEventKey = createHash("sha256").update(`${eventId}:${index}:${item.id}:${status}:${item.timestamp || ""}`).digest("hex");
    const message = await prisma.message.findFirst({ where: { channelConnectionId: connection.id, providerMessageId: item.id } });
    try {
      await prisma.messageDeliveryEvent.create({ data: { projectId: connection.projectId, messageId: message?.id, channelConnectionId: connection.id, providerMessageId: item.id, providerStatus: status, providerTimestamp: fromUnix(item.timestamp), externalEventKey, errorCode: item.errors?.[0]?.code ? String(item.errors[0].code) : null, metadataRedacted: JSON.stringify({ providerEventId: eventId, errorCount: item.errors?.length || 0 }) } });
      recorded += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    await reconcilePendingDeliveryEvents(connection.id, item.id);
  }
  return recorded;
}

export async function processMetaProviderEvent(providerEventId: string, workerId: string) {
  const leaseCutoff = new Date(Date.now() - Number(process.env.PROVIDER_EVENT_LEASE_MS || 60_000));
  const claimed = await prisma.providerEvent.updateMany({
    where: { id: providerEventId, provider: "META_WHATSAPP", OR: [{ status: { in: ["RECEIVED", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: leaseCutoff } }] },
    data: { status: "PROCESSING", attempts: { increment: 1 }, lastErrorCode: null },
  });
  if (!claimed.count) {
    const current = await prisma.providerEvent.findUnique({ where: { id: providerEventId }, select: { status: true } });
    return { status: current?.status === "PROCESSED" ? "DUPLICATE" : "NOT_CLAIMED", workerId };
  }
  const event = await prisma.providerEvent.findUniqueOrThrow({ where: { id: providerEventId }, include: { channelConnection: true } });
  try {
    if (!event.payloadEncrypted) throw new Error("META_EVENT_PAYLOAD_MISSING");
    if (!event.channelConnection.isActive || event.channelConnection.provider !== "META_WHATSAPP") throw new Error("META_CONNECTION_NOT_ACTIVE");
    const payload = JSON.parse(decryptProviderEventPayload(event.payloadEncrypted, { projectId: event.projectId, connectionId: event.channelConnectionId })) as StoredChange;
    const value = payload.change?.value || {};
    const inbound = await processInbound(event.id, event.channelConnection, value);
    const statuses = await processStatuses(event.id, event.channelConnection, value);
    await prisma.$transaction([
      prisma.providerEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), payloadEncrypted: null } }),
      prisma.auditEvent.create({ data: { projectId: event.projectId, action: "META_WEBHOOK_PROCESSED", resourceType: "ProviderEvent", resourceId: event.id, metadataRedacted: JSON.stringify({ inbound, statuses, workerId }) } }),
    ]);
    return { status: "PROCESSED", inbound, statuses };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "META_PROCESSING_FAILED";
    await prisma.providerEvent.update({ where: { id: event.id }, data: { status: "FAILED", lastErrorCode: code } });
    throw error;
  }
}
