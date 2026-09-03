import { randomUUID } from "node:crypto";
import { Prisma, type OutboxEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createFoundationQueue, isQueueName } from "@/lib/queues";
import type { QueueName } from "@/lib/queues";
import { structuredLog } from "@/lib/observability";

export type DispatchResult = { claimed: number; published: number; retried: number; deadLettered: number; recoveredExpiredLeases: number };

type QueuePublisher = {
  add: (name: string, data: Record<string, unknown>, options: { jobId: string; attempts?: number; backoff?: { type: "exponential"; delay: number }; removeOnComplete?: number }) => Promise<unknown>;
  close: () => Promise<void>;
};

type QueueFactory = (name: QueueName) => QueuePublisher;

type DispatchOptions = {
  workerId?: string;
  leaseMs?: number;
  projectId?: string;
  queueFactory?: QueueFactory;
};

const defaultQueueFactory: QueueFactory = (name) => {
  const queue = createFoundationQueue(name);
  return {
    add: (jobName, data, options) => queue.add(jobName, data, options),
    close: () => queue.close(),
  };
};

export function outboxBackoffMs(attempt: number, random = Math.random()) {
  const base = Math.min(300_000, 1000 * (2 ** Math.max(0, attempt - 1)));
  return Math.round(base * (0.75 + Math.min(1, Math.max(0, random)) * 0.5));
}

export function shouldDeadLetter(attempts: number, maxAttempts: number) {
  return attempts >= maxAttempts;
}

async function claimOutbox(limit: number, workerId: string, leaseMs: number, projectId?: string) {
  const projectFilter = projectId ? Prisma.sql`AND "projectId" = ${projectId}` : Prisma.empty;
  return prisma.$transaction(async (tx) => tx.$queryRaw<OutboxEvent[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "OutboxEvent"
      WHERE (("status" = 'PENDING' AND "availableAt" <= NOW())
        OR ("status" = 'PROCESSING' AND "lockedUntil" < NOW()))
      ${projectFilter}
      ORDER BY "availableAt", "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "OutboxEvent" AS event
    SET "status" = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = ${workerId},
        "lockedUntil" = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
        "lastAttemptAt" = NOW(), "attempts" = event."attempts" + 1, "updatedAt" = NOW()
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event.*
  `);
}

async function publishDeadLetter(event: OutboxEvent, queueFactory: QueueFactory) {
  const queue = queueFactory("dead-letter");
  try {
    await queue.add("OUTBOX_DEAD_LETTER", { outboxEventId: event.id, projectId: event.projectId, errorCode: "MAX_ATTEMPTS_EXCEEDED" }, { jobId: `dlq-${event.id}` });
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { deadLetterPublishedAt: new Date() } });
  } finally { await queue.close(); }
}

export async function dispatchOutboxBatch(limit = 25, options: DispatchOptions = {}): Promise<DispatchResult> {
  const workerId = options.workerId || `scheduler-${randomUUID()}`;
  const leaseMs = options.leaseMs || Number(process.env.OUTBOX_LEASE_MS || 60_000);
  const queueFactory = options.queueFactory || defaultQueueFactory;
  const claimed = await claimOutbox(limit, workerId, leaseMs, options.projectId);
  const result: DispatchResult = { claimed: claimed.length, published: 0, retried: 0, deadLettered: 0, recoveredExpiredLeases: claimed.filter((row) => row.attempts > 1).length };

  for (const event of claimed) {
    try {
      if (!isQueueName(event.targetQueue)) throw new Error("UNKNOWN_TARGET_QUEUE");
      const queue = queueFactory(event.targetQueue);
      try {
        await queue.add(event.eventType, { outboxEventId: event.id, projectId: event.projectId }, { jobId: event.id, attempts: event.maxAttempts, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000 });
      } finally { await queue.close(); }
      await prisma.outboxEvent.updateMany({ where: { id: event.id, status: "PROCESSING", lockedBy: workerId }, data: { status: "PUBLISHED", publishedAt: new Date(), lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: null } });
      result.published += 1;
    } catch (error) {
      const errorCode = error instanceof Error && error.message === "UNKNOWN_TARGET_QUEUE" ? "UNKNOWN_TARGET_QUEUE" : "QUEUE_PUBLISH_FAILED";
      if (errorCode === "UNKNOWN_TARGET_QUEUE" || shouldDeadLetter(event.attempts, event.maxAttempts)) {
        await prisma.outboxEvent.updateMany({ where: { id: event.id, status: "PROCESSING", lockedBy: workerId }, data: { status: "DEAD_LETTER", deadLetteredAt: new Date(), lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: errorCode } });
        try { await publishDeadLetter(event, queueFactory); } catch { structuredLog("error", "outbox.dlq.publish.failed", { outboxEventId: event.id, errorCode: "DLQ_UNAVAILABLE" }); }
        result.deadLettered += 1;
      } else {
        await prisma.outboxEvent.updateMany({ where: { id: event.id, status: "PROCESSING", lockedBy: workerId }, data: { status: "PENDING", lockedAt: null, lockedBy: null, lockedUntil: null, lastErrorCode: errorCode, availableAt: new Date(Date.now() + outboxBackoffMs(event.attempts)) } });
        result.retried += 1;
      }
      structuredLog("error", "outbox.publish.failed", { outboxEventId: event.id, errorCode });
    }
  }
  return result;
}
