import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { dispatchOutboxBatch } from "../../lib/outbox/dispatcher";
import { createFoundationQueue, type QueueName } from "../../lib/queues";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true" && Boolean(process.env.TEST_REDIS_URL);

test("outbox recupera crashes, evita duplicatas e aplica retry/DLQ sob concorrência", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const projectId = `outbox-project-${suffix}`;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL;
  process.env.QUEUE_PREFIX = `crm-b16-ci-outbox-${suffix}`;
  const providerQueue = createFoundationQueue("provider-events");
  const deadLetterQueue = createFoundationQueue("dead-letter");

  const createEvent = (label: string, data: Partial<{
    status: string;
    attempts: number;
    maxAttempts: number;
    lockedAt: Date;
    lockedBy: string;
    lockedUntil: Date;
    targetQueue: string;
  }> = {}) => prisma.outboxEvent.create({
    data: {
      projectId,
      aggregateType: "Synthetic",
      aggregateId: label,
      eventType: "SYNTHETIC_EVENT",
      payload: "{}",
      idempotencyKey: `${suffix}-${label}`,
      ...data,
    },
  });

  try {
    await prisma.project.create({ data: { id: projectId, name: "Synthetic outbox resilience" } });

    // Simula processo morto depois do claim e antes de queue.add.
    const claimedBeforePublish = await createEvent("crash-before-add", {
      status: "PROCESSING",
      attempts: 1,
      lockedAt: new Date(Date.now() - 120_000),
      lockedBy: "dead-scheduler-before-add",
      lockedUntil: new Date(Date.now() - 60_000),
    });
    const recoveredBeforePublish = await dispatchOutboxBatch(1, { workerId: "recovery-before-add" });
    assert.equal(recoveredBeforePublish.recoveredExpiredLeases, 1);
    assert.equal((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claimedBeforePublish.id } })).status, "PUBLISHED");
    assert.ok(await providerQueue.getJob(claimedBeforePublish.id));

    // Simula processo morto depois de queue.add e antes do update no PostgreSQL.
    const claimedAfterPublish = await createEvent("crash-after-add", {
      status: "PROCESSING",
      attempts: 1,
      lockedAt: new Date(Date.now() - 120_000),
      lockedBy: "dead-scheduler-after-add",
      lockedUntil: new Date(Date.now() - 60_000),
    });
    await providerQueue.add("SYNTHETIC_EVENT", { outboxEventId: claimedAfterPublish.id, projectId }, { jobId: claimedAfterPublish.id });
    const countAfterFirstAdd = (await providerQueue.getJobCounts("waiting")).waiting;
    const recoveredAfterPublish = await dispatchOutboxBatch(1, { workerId: "recovery-after-add" });
    assert.equal(recoveredAfterPublish.recoveredExpiredLeases, 1);
    assert.equal((await providerQueue.getJobCounts("waiting")).waiting, countAfterFirstAdd);
    assert.equal((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claimedAfterPublish.id } })).status, "PUBLISHED");

    // Dois schedulers disputam o mesmo lote; SKIP LOCKED deve entregar cada linha uma única vez.
    const concurrentIds = await Promise.all(Array.from({ length: 12 }, (_, index) => createEvent(`concurrent-${index}`))).then((rows) => rows.map((row) => row.id));
    const concurrentResults = await Promise.all([
      dispatchOutboxBatch(12, { workerId: "scheduler-a" }),
      dispatchOutboxBatch(12, { workerId: "scheduler-b" }),
    ]);
    assert.equal(concurrentResults.reduce((sum, result) => sum + result.claimed, 0), 12);
    assert.equal(await prisma.outboxEvent.count({ where: { id: { in: concurrentIds }, status: "PUBLISHED" } }), 12);
    assert.equal((await Promise.all(concurrentIds.map((id) => providerQueue.getJob(id)))).filter(Boolean).length, 12);

    // Redis indisponível: falha transitória devolve a linha para PENDING com backoff.
    const redisUnavailable = await createEvent("redis-unavailable");
    const unavailableFactory = () => ({
      add: async () => { throw new Error("SYNTHETIC_REDIS_UNAVAILABLE"); },
      close: async () => undefined,
    });
    const retryResult = await dispatchOutboxBatch(1, { workerId: "scheduler-retry", queueFactory: unavailableFactory });
    assert.equal(retryResult.retried, 1);
    const retryRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: redisUnavailable.id } });
    assert.equal(retryRow.status, "PENDING");
    assert.equal(retryRow.lastErrorCode, "QUEUE_PUBLISH_FAILED");
    assert.ok(retryRow.availableAt.getTime() > Date.now());

    // Na tentativa máxima, a referência mínima vai para a DLQ real, sem payload do evento.
    const maxAttempts = await createEvent("max-attempts", { attempts: 1, maxAttempts: 2 });
    const failTargetOnly = (name: QueueName) => {
      if (name === "provider-events") return unavailableFactory(name);
      const queue = createFoundationQueue(name);
      return {
        add: (jobName: string, data: Record<string, unknown>, options: { jobId: string }) => queue.add(jobName, data, options),
        close: () => queue.close(),
      };
    };
    const deadLetterResult = await dispatchOutboxBatch(1, { workerId: "scheduler-dlq", queueFactory: failTargetOnly });
    assert.equal(deadLetterResult.deadLettered, 1);
    const deadLetterRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: maxAttempts.id } });
    assert.equal(deadLetterRow.status, "DEAD_LETTER");
    assert.ok(deadLetterRow.deadLetteredAt);
    assert.ok(deadLetterRow.deadLetterPublishedAt);
    const deadLetterJob = await deadLetterQueue.getJob(`dlq-${maxAttempts.id}`);
    assert.deepEqual(deadLetterJob?.data, { outboxEventId: maxAttempts.id, projectId, errorCode: "MAX_ATTEMPTS_EXCEEDED" });

    // Reexecução não republica eventos terminalmente processados.
    const idempotentReplay = await dispatchOutboxBatch(50, { workerId: "scheduler-replay" });
    assert.equal(idempotentReplay.claimed, 0);
  } finally {
    await providerQueue.obliterate({ force: true }).catch(() => undefined);
    await deadLetterQueue.obliterate({ force: true }).catch(() => undefined);
    await providerQueue.close();
    await deadLetterQueue.close();
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.$disconnect();
  }
});
