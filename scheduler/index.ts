import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { validateServiceEnvironment } from "@/lib/env";
import { dispatchOutboxBatch } from "@/lib/outbox/dispatcher";
import { structuredLog } from "@/lib/observability";
import { createRedisConnection } from "@/lib/queues/connection";
import { prisma } from "@/lib/prisma";
import { startHealthServer, startServiceHeartbeat } from "@/lib/process-health";

validateServiceEnvironment("scheduler");
const redis = createRedisConnection();
const health = startHealthServer(Number(process.env.HEALTH_PORT || 3002), "scheduler", redis);
const stopHeartbeat = startServiceHeartbeat("scheduler", redis);
const schedulerId = `scheduler-${randomUUID()}`;
let stopping = false;

async function run() {
  structuredLog("info", "scheduler.ready");
  while (!stopping) {
    try {
      const result = await dispatchOutboxBatch(25, { workerId: schedulerId });
      if (result.claimed) structuredLog("info", "outbox.batch.completed", result);
    } catch {
      structuredLog("error", "outbox.batch.failed", { errorCode: "OUTBOX_BATCH_FAILED" });
    }
    await sleep(Number(process.env.OUTBOX_POLL_INTERVAL_MS || 5000));
  }
}

async function shutdown(signal: string) {
  stopping = true;
  structuredLog("info", "scheduler.shutdown", { signal });
  stopHeartbeat();
  health.close();
  await redis.quit();
  await prisma.$disconnect();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void run();
