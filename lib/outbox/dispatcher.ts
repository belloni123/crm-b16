import type { OutboxEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createFoundationQueue } from "@/lib/queues";
import { structuredLog } from "@/lib/observability";

export async function dispatchOutboxBatch(limit = 25) {
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxEvent[]>`
      SELECT * FROM "OutboxEvent"
      WHERE status = 'PENDING' AND "availableAt" <= NOW()
      ORDER BY "availableAt", "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;
    if (rows.length) {
      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, status: "PENDING" },
        data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } },
      });
    }
    return rows;
  });

  if (!claimed.length) return 0;
  const queue = createFoundationQueue("outbox-dispatch");
  try {
    for (const event of claimed) {
      try {
        await queue.add(event.eventType, { outboxEventId: event.id, projectId: event.projectId }, { jobId: event.id });
        await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "PUBLISHED", publishedAt: new Date(), lockedAt: null } });
      } catch {
        await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "PENDING", lockedAt: null, lastErrorCode: "QUEUE_PUBLISH_FAILED", availableAt: new Date(Date.now() + 30_000) } });
        structuredLog("error", "outbox.publish.failed", { outboxEventId: event.id });
      }
    }
  } finally {
    await queue.close();
  }
  return claimed.length;
}
