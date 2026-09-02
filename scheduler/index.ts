import { setTimeout as sleep } from "node:timers/promises";
import { assertOutboundDisabled } from "@/lib/env";
import { dispatchOutboxBatch } from "@/lib/outbox/dispatcher";
import { structuredLog } from "@/lib/observability";
import { createRedisConnection } from "@/lib/queues/connection";
import { prisma } from "@/lib/prisma";
import { startHealthServer } from "@/lib/process-health";

assertOutboundDisabled();
const redis = createRedisConnection();
const health = startHealthServer(Number(process.env.HEALTH_PORT || 3002), "scheduler", redis);
let stopping = false;

async function run() {
  structuredLog("info", "scheduler.ready");
  while (!stopping) {
    try {
      const count = await dispatchOutboxBatch();
      if (count) structuredLog("info", "outbox.batch.published", { count });
    } catch {
      structuredLog("error", "outbox.batch.failed", { errorCode: "OUTBOX_BATCH_FAILED" });
    }
    await sleep(Number(process.env.OUTBOX_POLL_INTERVAL_MS || 5000));
  }
}

async function shutdown(signal: string) {
  stopping = true;
  structuredLog("info", "scheduler.shutdown", { signal });
  health.close();
  await redis.quit();
  await prisma.$disconnect();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void run();
