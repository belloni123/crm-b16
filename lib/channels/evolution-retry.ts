import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bridgeLegacyInbound, bridgeLegacyOutboundResult, EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY } from "./evolution-bridge";

const RETRY_EVENT_TYPES = new Set([EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY]);
const PERMANENT_CODES = new Set([
  "EVOLUTION_RETRY_INVALID_PAYLOAD",
  "EVOLUTION_RETRY_EVENT_MISMATCH",
  "EVOLUTION_RETRY_OUTBOX_NOT_FOUND",
  "EVOLUTION_BRIDGE_MESSAGE_NOT_FOUND",
  "EVOLUTION_BRIDGE_DIRECTION_MISMATCH",
  "EVOLUTION_BRIDGE_SCOPE_MISMATCH",
  "EVOLUTION_BRIDGE_PROJECT_MISMATCH",
]);

export type EvolutionRetryResult = { status: "PROCESSED" | "DUPLICATE" | "IN_PROGRESS" | "DISABLED" | "DEAD_LETTER"; errorCode?: string };
type RetryExecutors = {
  inbound?: typeof bridgeLegacyInbound;
  outbound?: typeof bridgeLegacyOutboundResult;
};

function objectPayload(serialized: string) {
  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("EVOLUTION_RETRY_INVALID_PAYLOAD");
  return parsed as Record<string, unknown>;
}

function requiredString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value) throw new Error("EVOLUTION_RETRY_INVALID_PAYLOAD");
  return value;
}

export function classifyEvolutionRetryError(error: unknown) {
  const code = error instanceof Error ? error.message : "EVOLUTION_RETRY_UNKNOWN";
  if (PERMANENT_CODES.has(code)) return { transient: false, code };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2025"].includes(error.code)) return { transient: false, code: `DATABASE_${error.code}` };
  return { transient: true, code: error instanceof Prisma.PrismaClientKnownRequestError ? `DATABASE_${error.code}` : "EVOLUTION_RETRY_TRANSIENT" };
}

export async function processEvolutionRetryOutbox(outboxEventId: string, workerId = `evolution-worker-${randomUUID()}`, executors: RetryExecutors = {}): Promise<EvolutionRetryResult> {
  const event = await prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
  if (!event) return { status: "DEAD_LETTER", errorCode: "EVOLUTION_RETRY_OUTBOX_NOT_FOUND" };
  if (!RETRY_EVENT_TYPES.has(event.eventType)) return { status: "DEAD_LETTER", errorCode: "EVOLUTION_RETRY_EVENT_MISMATCH" };
  if (event.status === "PROCESSED") return { status: "DUPLICATE" };
  if (event.status === "DEAD_LETTER") return { status: "DEAD_LETTER", errorCode: event.lastErrorCode || undefined };

  const claimed = await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: { in: ["PUBLISHED", "PENDING"] } },
    data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: workerId, lockedUntil: new Date(Date.now() + 60_000), lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) return { status: "IN_PROGRESS" };

  try {
    const payload = objectPayload(event.payload);
    const messageId = requiredString(payload, "messageId");
    if (messageId !== event.aggregateId || event.aggregateType !== "Message") throw new Error("EVOLUTION_RETRY_INVALID_PAYLOAD");
    let result: { status: "LINKED" | "DISABLED" };
    if (event.eventType === EVOLUTION_INBOUND_RETRY) {
      result = await (executors.inbound || bridgeLegacyInbound)({ projectId: event.projectId, messageId, conversationId: requiredString(payload, "conversationId"), instanceId: requiredString(payload, "instanceId") });
    } else {
      if (typeof payload.accepted !== "boolean") throw new Error("EVOLUTION_RETRY_INVALID_PAYLOAD");
      result = await (executors.outbound || bridgeLegacyOutboundResult)({
        projectId: event.projectId,
        messageId,
        accepted: payload.accepted,
        providerMessageId: typeof payload.providerMessageId === "string" ? payload.providerMessageId : null,
        errorCode: typeof payload.errorCode === "string" ? payload.errorCode : undefined,
      });
    }
    await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: "PROCESSING", lockedBy: workerId },
      data: { status: "PROCESSED", lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: result.status === "DISABLED" ? "FEATURE_DISABLED" : null },
    });
    return { status: result.status === "DISABLED" ? "DISABLED" : "PROCESSED" };
  } catch (error) {
    const classified = classifyEvolutionRetryError(error);
    await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: "PROCESSING", lockedBy: workerId },
      data: classified.transient
        ? { status: "PUBLISHED", lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: classified.code }
        : { status: "DEAD_LETTER", deadLetteredAt: new Date(), lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: classified.code },
    });
    if (classified.transient) throw new Error(classified.code);
    return { status: "DEAD_LETTER", errorCode: classified.code };
  }
}

export async function markEvolutionRetryDeadLetter(outboxEventId: string, errorCode = "EVOLUTION_RETRY_MAX_ATTEMPTS") {
  await prisma.outboxEvent.updateMany({
    where: { id: outboxEventId, eventType: { in: [EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY] }, status: { not: "PROCESSED" } },
    data: { status: "DEAD_LETTER", deadLetteredAt: new Date(), lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: errorCode },
  });
}
