import { PrismaClient } from "@prisma/client";
import { bridgeLegacyInbound, bridgeLegacyOutboundResult } from "../lib/channels/evolution-bridge";
import { assertOutboundDisabled } from "../lib/env";
import { createFoundationQueue } from "../lib/queues";

const prisma = new PrismaClient();
const projectId = "staging-project-omnichannel";
const inboundMessageId = "staging-evolution-message";
const outboundMessageId = "staging-evolution-outbound-message";

async function main() {
  if (process.env.DEPLOYMENT_ENV !== "staging" || process.env.DB_SAFETY_SCOPE !== "staging") throw new Error("Synthetic dual-write test is staging-only.");
  if (process.env.DUAL_WRITE_TEST_CONFIRMATION !== "staging:synthetic-only") throw new Error("DUAL_WRITE_TEST_CONFIRMATION is required.");
  assertOutboundDisabled();
  const instance = await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: "staging-evolution-instance" } });
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: "staging-evolution-conversation" } });
  await prisma.projectFeature.update({ where: { projectId_key: { projectId, key: "evolution_dual_write" } }, data: { enabled: true } });
  await prisma.auditEvent.create({ data: { projectId, action: "FEATURE_TEMPORARILY_ENABLED", resourceType: "ProjectFeature", resourceId: "evolution_dual_write", reason: "SYNTHETIC_DUAL_WRITE_TEST" } });
  try {
    const inbound = await bridgeLegacyInbound({ projectId, instanceId: instance.id, conversationId: conversation.id, messageId: inboundMessageId });
    const outbound = await bridgeLegacyOutboundResult({ projectId, messageId: outboundMessageId, providerMessageId: "fake-provider-message-id", accepted: true });
    if (inbound.status !== "LINKED" || outbound.status !== "LINKED") throw new Error("SYNTHETIC_DUAL_WRITE_NOT_LINKED");
    const linked = await prisma.message.count({ where: { id: { in: [inboundMessageId, outboundMessageId] }, projectId, channelConnectionId: { not: null } } });
    if (linked !== 2) throw new Error("SYNTHETIC_DUAL_WRITE_COVERAGE_FAILED");
    process.stdout.write(`${JSON.stringify({ event: "synthetic_dual_write_passed", inbound: inbound.status, outbound: outbound.status, linkedMessages: linked })}\n`);
  } finally {
    await prisma.projectFeature.updateMany({ where: { projectId }, data: { enabled: false } });
    await prisma.channelConnection.updateMany({ where: { projectId, provider: "EVOLUTION" }, data: { isActive: false } });
    await prisma.auditEvent.create({ data: { projectId, action: "FEATURE_DISABLED", resourceType: "ProjectFeature", resourceId: "evolution_dual_write", reason: "SYNTHETIC_DUAL_WRITE_TEST_COMPLETE" } });
    const outboxes = await prisma.outboxEvent.findMany({ where: { aggregateId: { in: [inboundMessageId, outboundMessageId] } }, select: { id: true } });
    const queue = createFoundationQueue("provider-events");
    try {
      for (const outbox of outboxes) {
        const job = await queue.getJob(outbox.id);
        if (job && (await job.getState()) !== "active") await job.remove();
      }
    } finally { await queue.close(); }
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [inboundMessageId, outboundMessageId] }, status: { in: ["PENDING", "DEAD_LETTER"] } } });
    const pendingSynthetic = await prisma.outboxEvent.count({
      where: {
        aggregateId: { in: [inboundMessageId, outboundMessageId] },
        status: { in: ["PENDING", "PROCESSING", "DEAD_LETTER"] },
      },
    });
    if (pendingSynthetic !== 0) throw new Error("SYNTHETIC_OUTBOX_NOT_DRAINED");
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
