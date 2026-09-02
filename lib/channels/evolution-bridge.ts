import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/observability";
import { linkLegacyMessage } from "./evolution-compatibility";

async function dualWriteEnabled(projectId: string) {
  const flag = await prisma.projectFeature.findUnique({ where: { projectId_key: { projectId, key: "evolution_dual_write" } }, select: { enabled: true } });
  return flag?.enabled === true;
}

async function enqueueTechnicalEvent(projectId: string, messageId: string, eventType: string) {
  try {
    await prisma.outboxEvent.create({
      data: {
        projectId,
        aggregateType: "Message",
        aggregateId: messageId,
        eventType,
        targetQueue: "provider-events",
        payload: JSON.stringify({ messageId }),
        idempotencyKey: `evolution-dual-write:${eventType}:${messageId}`,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}

export async function bridgeLegacyInbound(input: { projectId: string; instanceId: string; conversationId: string; messageId: string }) {
  const startedAt = Date.now();
  if (!(await dualWriteEnabled(input.projectId))) return { status: "DISABLED" as const };
  const message = await prisma.message.findUnique({ where: { id: input.messageId }, include: { conversation: { include: { instance: true } } } });
  if (!message || message.conversationId !== input.conversationId || message.conversation.instanceId !== input.instanceId) throw new Error("EVOLUTION_BRIDGE_SCOPE_MISMATCH");
  if (message.conversation.instance.projectId !== input.projectId) throw new Error("EVOLUTION_BRIDGE_PROJECT_MISMATCH");
  await prisma.$transaction(async (tx) => {
    await linkLegacyMessage(tx, message.conversation.instance, message.conversation, message);
    await tx.auditEvent.create({
      data: {
        projectId: input.projectId,
        action: "EVOLUTION_DUAL_WRITE_INBOUND",
        resourceType: "Message",
        resourceId: message.id,
        metadataRedacted: JSON.stringify({ latencyMs: Date.now() - startedAt }),
      },
    });
  });
  await enqueueTechnicalEvent(input.projectId, message.id, "EVOLUTION_DUAL_WRITE");
  return { status: "LINKED" as const, latencyMs: Date.now() - startedAt };
}

export async function bridgeLegacyOutboundResult(input: { projectId: string; messageId: string; providerMessageId?: string | null; accepted: boolean; errorCode?: string }) {
  const startedAt = Date.now();
  if (!(await dualWriteEnabled(input.projectId))) return { status: "DISABLED" as const };
  const message = await prisma.message.findUnique({ where: { id: input.messageId }, include: { conversation: { include: { instance: true } } } });
  if (!message || message.conversation.instance.projectId !== input.projectId) throw new Error("EVOLUTION_BRIDGE_PROJECT_MISMATCH");
  await prisma.$transaction(async (tx) => {
    await linkLegacyMessage(tx, message.conversation.instance, message.conversation, message);
    await tx.message.update({
      where: { id: message.id },
      data: input.accepted
        ? { providerMessageId: input.providerMessageId || message.remoteId, acceptedAt: new Date(), errorCode: null, errorDetailRedacted: null }
        : { errorCode: input.errorCode || "PROVIDER_REJECTED", errorDetailRedacted: "Provider rejected the synthetic request.", failedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        projectId: input.projectId,
        action: "EVOLUTION_DUAL_WRITE_OUTBOUND",
        resourceType: "Message",
        resourceId: message.id,
        metadataRedacted: JSON.stringify({ accepted: input.accepted, latencyMs: Date.now() - startedAt }),
      },
    });
  });
  await enqueueTechnicalEvent(input.projectId, message.id, "EVOLUTION_DUAL_WRITE");
  return { status: "LINKED" as const, latencyMs: Date.now() - startedAt };
}

export async function bridgeLegacyInboundSafely(input: { projectId: string; instanceId: string; conversationId: string; messageId: string }) {
  try { return await bridgeLegacyInbound(input); }
  catch {
    try { await enqueueTechnicalEvent(input.projectId, input.messageId, "EVOLUTION_DUAL_WRITE_RETRY"); } catch { /* database outage: legacy request must still succeed */ }
    structuredLog("error", "evolution.bridge.failed", { messageId: input.messageId, errorCode: "EVOLUTION_BRIDGE_FAILED" });
    return { status: "RETRY_PENDING" as const };
  }
}

export async function bridgeLegacyOutboundSafely(input: { projectId: string; messageId: string; providerMessageId?: string | null; accepted: boolean; errorCode?: string }) {
  try { return await bridgeLegacyOutboundResult(input); }
  catch {
    try { await enqueueTechnicalEvent(input.projectId, input.messageId, "EVOLUTION_DUAL_WRITE_RETRY"); } catch { /* legacy flow stays primary */ }
    structuredLog("error", "evolution.bridge.failed", { messageId: input.messageId, errorCode: "EVOLUTION_BRIDGE_FAILED" });
    return { status: "RETRY_PENDING" as const };
  }
}
