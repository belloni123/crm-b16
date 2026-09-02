import { Worker } from "bullmq";
import { assertOutboundDisabled } from "@/lib/env";
import { structuredLog } from "@/lib/observability";
import { createRedisConnection } from "@/lib/queues/connection";
import { prisma } from "@/lib/prisma";
import { startHealthServer } from "@/lib/process-health";

assertOutboundDisabled();
const redis = createRedisConnection();
const workers = ["provider-events", "outbox-dispatch", "message-dispatch", "dead-letter"].map((queue) =>
  new Worker(queue, async (job) => {
    if (queue === "message-dispatch") {
      structuredLog("warn", "outbound.blocked", { jobId: job.id, reason: "OUTBOUND_INTEGRATIONS_DISABLED" });
      return { status: "BLOCKED" };
    }
    structuredLog("info", "foundation.job.noop", { queue, jobId: job.id });
    return { status: "NOOP" };
  }, { connection: createRedisConnection(), concurrency: 2 }),
);
const health = startHealthServer(Number(process.env.HEALTH_PORT || 3001), "worker", redis);

async function shutdown(signal: string) {
  structuredLog("info", "worker.shutdown", { signal });
  health.close();
  await Promise.all(workers.map((worker) => worker.close()));
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
structuredLog("info", "worker.ready", { queues: workers.length });
