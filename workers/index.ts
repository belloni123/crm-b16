import { Worker } from "bullmq";
import { queuePrefix, validateServiceEnvironment } from "@/lib/env";
import { structuredLog } from "@/lib/observability";
import { createRedisConnection, redisConnectionOptions } from "@/lib/queues/connection";
import { prisma } from "@/lib/prisma";
import { startHealthServer, startServiceHeartbeat } from "@/lib/process-health";
import { outboundDecision } from "@/lib/outbound-policy";
import { createFoundationQueue } from "@/lib/queues";
import { EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY } from "@/lib/channels/evolution-bridge";
import { markEvolutionRetryDeadLetter, processEvolutionRetryOutbox } from "@/lib/channels/evolution-retry";

validateServiceEnvironment("worker");
const redis = createRedisConnection();
const workerOptions = () => ({ prefix: queuePrefix(), connection: redisConnectionOptions(), concurrency: 2 });
const providerEventsWorker = new Worker("provider-events", async (job) => {
    if (!job.data.outboxEventId) throw new Error("MISSING_OUTBOX_EVENT_ID");
    if ([EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY].includes(job.name)) {
      const result = await processEvolutionRetryOutbox(job.data.outboxEventId, `bullmq-${job.id}`);
      if (result.status === "DEAD_LETTER") {
        const queue = createFoundationQueue("dead-letter");
        try {
          await queue.add("EVOLUTION_DUAL_WRITE_DEAD_LETTER", { outboxEventId: job.data.outboxEventId, projectId: job.data.projectId, errorCode: result.errorCode || "EVOLUTION_RETRY_PERMANENT" }, { jobId: `evolution-dlq-${job.data.outboxEventId}` });
        } finally { await queue.close(); }
      }
      return result;
    }
    if (!["PROVIDER_EVENT_RECEIVED", "EVOLUTION_DUAL_WRITE"].includes(job.name)) throw new Error("UNKNOWN_PROVIDER_EVENT_JOB");
    return { status: "RECORDED" };
  }, workerOptions());

providerEventsWorker.on("failed", async (job) => {
  if (!job || ![EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY].includes(job.name)) return;
  const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  if (job.attemptsMade < maxAttempts) return;
  const outboxEventId = job.data.outboxEventId as string | undefined;
  if (!outboxEventId) return;
  await markEvolutionRetryDeadLetter(outboxEventId);
  const queue = createFoundationQueue("dead-letter");
  try {
    await queue.add("EVOLUTION_DUAL_WRITE_DEAD_LETTER", { outboxEventId, projectId: job.data.projectId, errorCode: "EVOLUTION_RETRY_MAX_ATTEMPTS" }, { jobId: `evolution-dlq-${outboxEventId}` });
  } finally { await queue.close(); }
});

const workers = [
  providerEventsWorker,
  new Worker("outbox-dispatch", async () => { throw new Error("DEPRECATED_OUTBOX_DISPATCH_QUEUE"); }, workerOptions()),
  new Worker("message-dispatch", async () => {
    const decision = outboundDecision("EVOLUTION", "message-dispatch");
    return { status: decision.allowed ? "READY" : "BLOCKED" };
  }, workerOptions()),
  new Worker("dead-letter", async (job) => {
    if (!job.data.outboxEventId) throw new Error("MISSING_OUTBOX_EVENT_ID");
    structuredLog("error", "outbox.dead-letter.received", { outboxEventId: job.data.outboxEventId, errorCode: "DEAD_LETTER" });
    return { status: "RECORDED" };
  }, workerOptions()),
];
const health = startHealthServer(Number(process.env.HEALTH_PORT || 3001), "worker", redis);
const stopHeartbeat = startServiceHeartbeat("worker", redis);

async function shutdown(signal: string) {
  structuredLog("info", "worker.shutdown", { signal });
  stopHeartbeat();
  health.close();
  await Promise.all(workers.map((worker) => worker.close()));
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
structuredLog("info", "worker.ready", { queues: workers.length });
