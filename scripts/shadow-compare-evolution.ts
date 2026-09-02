import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertSafeTarget() {
  if (!(["isolated", "staging"] as Array<string | undefined>).includes(process.env.DB_SAFETY_SCOPE)) throw new Error("Shadow comparison refuses non-isolated targets.");
}

async function scalar(sql: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql);
  return Number(rows[0]?.count || 0);
}

async function main() {
  assertSafeTarget();
  const [
    instances, representedInstances, conversations, linkedConversations, identities,
    messages, linkedMessages, projectDivergence, leadDivergence, missingProviderIds,
    duplicateProviderIds, pendingRetries, deadLetters,
  ] = await Promise.all([
    prisma.whatsAppInstance.count(),
    prisma.channelConnection.count({ where: { provider: "EVOLUTION", legacyWhatsAppInstanceId: { not: null } } }),
    prisma.conversation.count(),
    prisma.conversation.count({ where: { channelConnectionId: { not: null }, contactIdentityId: { not: null }, channel: "WHATSAPP" } }),
    prisma.contactIdentity.count({ where: { channel: "WHATSAPP", channelConnection: { provider: "EVOLUTION" } } }),
    prisma.message.count(),
    prisma.message.count({ where: { projectId: { not: null }, channelConnectionId: { not: null } } }),
    scalar(`SELECT count(*)::bigint AS count FROM "Conversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId" WHERE c."projectId" IS DISTINCT FROM i."projectId"`),
    scalar(`SELECT count(*)::bigint AS count FROM "Conversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId" JOIN "Lead" l ON l.id=c."leadId" WHERE l."projectId" <> i."projectId"`),
    prisma.message.count({ where: { remoteId: { not: null }, providerMessageId: null } }),
    scalar(`SELECT count(*)::bigint AS count FROM (SELECT "channelConnectionId", "providerMessageId" FROM "Message" WHERE "providerMessageId" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d`),
    prisma.outboxEvent.count({ where: { eventType: "EVOLUTION_DUAL_WRITE_RETRY", status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.outboxEvent.count({ where: { eventType: { in: ["EVOLUTION_DUAL_WRITE", "EVOLUTION_DUAL_WRITE_RETRY"] }, status: "DEAD_LETTER" } }),
  ]);
  process.stdout.write(`${JSON.stringify({
    event: "evolution_shadow_comparison",
    instances: { legacy: instances, represented: representedInstances },
    conversations: { legacy: conversations, linked: linkedConversations, identities },
    messages: { legacy: messages, linked: linkedMessages, missingProviderIds, duplicateProviderIds },
    divergences: { project: projectDivergence, lead: leadDivergence },
    delivery: { pendingRetries, deadLetters },
  })}\n`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
