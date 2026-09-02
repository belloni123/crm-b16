import { Worker } from "bullmq";
import { queuePrefix, validateServiceEnvironment } from "@/lib/env";
import { structuredLog } from "@/lib/observability";
import { createRedisConnection } from "@/lib/queues/connection";
import { prisma } from "@/lib/prisma";
import { startHealthServer, startServiceHeartbeat } from "@/lib/process-health";
import { outboundDecision } from "@/lib/outbound-policy";

validateServiceEnvironment("worker");
const redis = createRedisConnection();
const workerOptions = () => ({ prefix: queuePrefix(), connection: createRedisConnection(), concurrency: 2 });
const workers = [
  new Worker("provider-events", async (job) => {
    if (!job.data.outboxEventId) throw new Error("MISSING_OUTBOX_EVENT_ID");
    if (!["PROVIDER_EVENT_RECEIVED", "EVOLUTION_DUAL_WRITE"].includes(job.name)) throw new Error("UNKNOWN_PROVIDER_EVENT_JOB");
    return { status: "RECORDED" };
  }, workerOptions()),
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
