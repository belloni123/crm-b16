import type { Conversation, Message, Prisma, WhatsAppInstance } from "@prisma/client";

type Db = Prisma.TransactionClient;

export type CompatibilityConflict =
  | "CONVERSATION_WITHOUT_LEAD"
  | "CONVERSATION_LEAD_PROJECT_MISMATCH"
  | "MESSAGE_WITHOUT_REMOTE_ID"
  | "REMOTE_ID_DUPLICATE_SAME_CONNECTION"
  | "REMOTE_ID_DUPLICATE_ACROSS_CONNECTIONS";

export async function ensureEvolutionConnection(db: Db, instance: WhatsAppInstance) {
  return db.channelConnection.upsert({
    where: { legacyWhatsAppInstanceId: instance.id },
    update: {
      projectId: instance.projectId,
      externalBusinessId: instance.instanceName,
      name: instance.name,
      status: instance.archivedAt ? "ARCHIVED" : `LEGACY_${instance.status}`,
      isActive: false,
      archivedAt: instance.archivedAt,
    },
    create: {
      projectId: instance.projectId,
      provider: "EVOLUTION",
      channel: "WHATSAPP",
      name: instance.name,
      status: instance.archivedAt ? "ARCHIVED" : `LEGACY_${instance.status}`,
      externalBusinessId: instance.instanceName,
      legacyWhatsAppInstanceId: instance.id,
      isActive: false,
      archivedAt: instance.archivedAt,
    },
  });
}

export async function linkLegacyConversation(db: Db, instance: WhatsAppInstance, conversation: Conversation) {
  const conflicts: CompatibilityConflict[] = [];
  const connection = await ensureEvolutionConnection(db, instance);
  let safeLeadId: string | null = null;
  if (!conversation.leadId) conflicts.push("CONVERSATION_WITHOUT_LEAD");
  else {
    const lead = await db.lead.findUnique({ where: { id: conversation.leadId }, select: { projectId: true } });
    if (lead?.projectId === instance.projectId) safeLeadId = conversation.leadId;
    else conflicts.push("CONVERSATION_LEAD_PROJECT_MISMATCH");
  }
  const identity = await db.contactIdentity.upsert({
    where: { channelConnectionId_externalUserId: { channelConnectionId: connection.id, externalUserId: conversation.whatsappId } },
    update: { projectId: instance.projectId, leadId: safeLeadId },
    create: {
      projectId: instance.projectId,
      channelConnectionId: connection.id,
      channel: "WHATSAPP",
      externalUserId: conversation.whatsappId,
      address: conversation.whatsappId,
      displayName: conversation.name,
      leadId: safeLeadId,
    },
  });
  const [inbound, outbound] = await Promise.all([
    db.message.aggregate({ where: { conversationId: conversation.id, direction: "INBOUND" }, _max: { createdAt: true } }),
    db.message.aggregate({ where: { conversationId: conversation.id, direction: "OUTBOUND" }, _max: { createdAt: true } }),
  ]);
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      projectId: instance.projectId,
      channelConnectionId: connection.id,
      contactIdentityId: identity.id,
      channel: "WHATSAPP",
      externalConversationId: `legacy:${conversation.id}`,
      lastInboundAt: inbound._max.createdAt,
      lastOutboundAt: outbound._max.createdAt,
    },
  });
  return { connection, identity, conflicts };
}

export async function linkLegacyMessage(db: Db, instance: WhatsAppInstance, conversation: Conversation, message: Message) {
  const { connection } = await linkLegacyConversation(db, instance, conversation);
  const conflicts: CompatibilityConflict[] = [];
  if (!message.remoteId) conflicts.push("MESSAGE_WITHOUT_REMOTE_ID");
  else {
    const duplicates = await db.message.findMany({
      where: { remoteId: message.remoteId, id: { not: message.id } },
      select: { conversation: { select: { instanceId: true } } },
      take: 2,
    });
    if (duplicates.some((item) => item.conversation.instanceId === instance.id)) conflicts.push("REMOTE_ID_DUPLICATE_SAME_CONNECTION");
    if (duplicates.some((item) => item.conversation.instanceId !== instance.id)) conflicts.push("REMOTE_ID_DUPLICATE_ACROSS_CONNECTIONS");
  }
  await db.message.update({
    where: { id: message.id },
    data: { projectId: instance.projectId, channelConnectionId: connection.id, providerMessageId: message.remoteId || null },
  });
  return { connection, conflicts };
}
