import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/observability";
import { linkLegacyMessage } from "./evolution-compatibility";

export const EVOLUTION_INBOUND_RETRY = "EVOLUTION_DUAL_WRITE_INBOUND_RETRY";
export const EVOLUTION_OUTBOUND_RETRY = "EVOLUTION_DUAL_WRITE_OUTBOUND_RETRY";

type InboundInput = { projectId: string; instanceId: string; conversationId: string; messageId: string };
type OutboundInput = { projectId: string; messageId: string; providerMessageId?: string | null; accepted: boolean; errorCode?: string };

async function dualWriteEnabled(projectId: string) {
  const flag = await prisma.projectFeature.findUnique({ where: { projectId_key: { projectId, key: "evolution_dual_write" } }, select: { enabled: true } });
  return flag?.enabled === true;
}

async function enqueueTechnicalEvent(projectId: string, messageId: string, eventType: string, payload: Record<string, unknown>) {
  try {
    await prisma.outboxEvent.create({
      data: {
        projectId,
        aggregateType: "Message",
        aggregateId: messageId,
        eventType,
        targetQueue: "provider-events",
        payload: JSON.stringify(payload),
        idempotencyKey: `evolution-dual-write:${eventType}:${messageId}`,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}

async function auditOnce(tx: Prisma.TransactionClient, input: { projectId: string; action: string; messageId: string; metadataRedacted: string }) {
  const existing = await tx.auditEvent.findFirst({
    where: { projectId: input.projectId, action: input.action, resourceType: "Message", resourceId: input.messageId, reason: "EVOLUTION_BRIDGE_V1" },
    select: { id: true },
  });
  if (!existing) {
    await tx.auditEvent.create({
      data: {
        projectId: input.projectId,
        action: input.action,
        resourceType: "Message",
        resourceId: input.messageId,
        reason: "EVOLUTION_BRIDGE_V1",
        metadataRedacted: input.metadataRedacted,
      },
    });
  }
}

export async function bridgeLegacyInbound(input: InboundInput) {
  const startedAt = Date.now();
  const message = await prisma.message.findUnique({ where: { id: input.messageId }, include: { conversation: { include: { instance: true } } } });
  if (!message) throw new Error("EVOLUTION_BRIDGE_MESSAGE_NOT_FOUND");
  if (message.direction !== "INBOUND") throw new Error("EVOLUTION_BRIDGE_DIRECTION_MISMATCH");
  if (message.conversationId !== input.conversationId || message.conversation.instanceId !== input.instanceId || !message.conversation.instance) throw new Error("EVOLUTION_BRIDGE_SCOPE_MISMATCH");
  const instance = message.conversation.instance;
  if (instance.projectId !== input.projectId) throw new Error("EVOLUTION_BRIDGE_PROJECT_MISMATCH");
  if (!(await dualWriteEnabled(input.projectId))) return { status: "DISABLED" as const };
  await prisma.$transaction(async (tx) => {
    await linkLegacyMessage(tx, instance, message.conversation, message);
    await auditOnce(tx, { projectId: input.projectId, action: "EVOLUTION_DUAL_WRITE_INBOUND", messageId: message.id, metadataRedacted: JSON.stringify({ latencyMs: Date.now() - startedAt }) });
  });
  return { status: "LINKED" as const, latencyMs: Date.now() - startedAt };
}

export async function bridgeLegacyOutboundResult(input: OutboundInput) {
  const startedAt = Date.now();
  const message = await prisma.message.findUnique({ where: { id: input.messageId }, include: { conversation: { include: { instance: true } } } });
  if (!message) throw new Error("EVOLUTION_BRIDGE_MESSAGE_NOT_FOUND");
  if (message.direction !== "OUTBOUND") throw new Error("EVOLUTION_BRIDGE_DIRECTION_MISMATCH");
  if (!message.conversation.instance) throw new Error("EVOLUTION_BRIDGE_SCOPE_MISMATCH");
  const instance = message.conversation.instance;
  if (instance.projectId !== input.projectId) throw new Error("EVOLUTION_BRIDGE_PROJECT_MISMATCH");
  if (!(await dualWriteEnabled(input.projectId))) return { status: "DISABLED" as const };
  await prisma.$transaction(async (tx) => {
    await linkLegacyMessage(tx, instance, message.conversation, message);
    await tx.message.update({
      where: { id: message.id },
      data: input.accepted
        ? { providerMessageId: input.providerMessageId || message.remoteId, acceptedAt: message.acceptedAt || new Date(), errorCode: null, errorDetailRedacted: null, failedAt: null }
        : { errorCode: input.errorCode || "PROVIDER_REJECTED", errorDetailRedacted: "Provider rejected the request.", failedAt: message.failedAt || new Date() },
    });
    await auditOnce(tx, { projectId: input.projectId, action: "EVOLUTION_DUAL_WRITE_OUTBOUND", messageId: message.id, metadataRedacted: JSON.stringify({ accepted: input.accepted, latencyMs: Date.now() - startedAt }) });
  });
  return { status: "LINKED" as const, latencyMs: Date.now() - startedAt };
}

export async function bridgeLegacyInboundSafely(input: InboundInput) {
  if (!(await dualWriteEnabled(input.projectId))) return { status: "DISABLED" as const };
  try {
    return await bridgeLegacyInbound(input);
  } catch {
    try {
      await enqueueTechnicalEvent(input.projectId, input.messageId, EVOLUTION_INBOUND_RETRY, { messageId: input.messageId, conversationId: input.conversationId, instanceId: input.instanceId });
    } catch { /* database outage: legacy request must still succeed */ }
    structuredLog("error", "evolution.bridge.failed", { messageId: input.messageId, errorCode: "EVOLUTION_BRIDGE_FAILED" });
    return { status: "RETRY_PENDING" as const };
  }
}

export async function bridgeLegacyOutboundSafely(input: OutboundInput) {
  if (!(await dualWriteEnabled(input.projectId))) return { status: "DISABLED" as const };
  try {
    return await bridgeLegacyOutboundResult(input);
  } catch {
    try {
      await enqueueTechnicalEvent(input.projectId, input.messageId, EVOLUTION_OUTBOUND_RETRY, { messageId: input.messageId, accepted: input.accepted, providerMessageId: input.providerMessageId || null, errorCode: input.errorCode || null });
    } catch { /* legacy flow stays primary */ }
    structuredLog("error", "evolution.bridge.failed", { messageId: input.messageId, errorCode: "EVOLUTION_BRIDGE_FAILED" });
    return { status: "RETRY_PENDING" as const };
  }
}
