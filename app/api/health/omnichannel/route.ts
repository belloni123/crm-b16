import { prisma } from "@/lib/prisma";
import { createFoundationQueue } from "@/lib/queues";
import { deploymentEnvironment, isOutboundDisabled } from "@/lib/env";
import { createRedisConnection } from "@/lib/queues/connection";
import { serviceHeartbeatKey } from "@/lib/process-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cached: { expiresAt: number; body: Record<string, unknown>; status: number } | undefined;

export async function GET() {
  if (cached && cached.expiresAt > Date.now()) return Response.json(cached.body, { status: cached.status });
  const outboxQueue = createFoundationQueue("outbox-dispatch");
  const deadLetterQueue = createFoundationQueue("dead-letter");
  const redis = createRedisConnection();
  try {
    const [pendingOutbox, deadLetteredOutbox, outboxJobs, deadLetterJobs, enabledFeatures, workerHeartbeat, schedulerHeartbeat] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.outboxEvent.count({ where: { status: "DEAD_LETTER" } }),
      outboxQueue.getJobCounts("waiting", "active", "failed", "completed"),
      deadLetterQueue.getJobCounts("waiting", "failed"),
      prisma.projectFeature.count({ where: { enabled: true } }),
      redis.get(serviceHeartbeatKey("worker")),
      redis.get(serviceHeartbeatKey("scheduler")),
    ]);
    const worker = workerHeartbeat ? "healthy" : "degraded";
    const scheduler = schedulerHeartbeat ? "healthy" : "degraded";
    const status = worker === "healthy" && scheduler === "healthy" ? "healthy" : "degraded";
    const details = deploymentEnvironment() === "staging" ? {
      services: { postgresql: "healthy", redis: "healthy", worker, scheduler },
      metrics: { pendingOutbox, deadLetteredOutbox, outboxJobs, deadLetterJobs },
    } : {};
    const body = {
      status,
      outboundIntegrationsDisabled: isOutboundDisabled(),
      enabledFeatures,
      version: process.env.DEPLOYMENT_VERSION || process.env.SOURCE_COMMIT || "unknown",
      ...details,
    };
    cached = { expiresAt: Date.now() + 5000, body, status: status === "healthy" ? 200 : 207 };
    return Response.json(body, { status: cached.status });
  } catch {
    const body = { status: "unavailable", outboundIntegrationsDisabled: isOutboundDisabled(), version: process.env.DEPLOYMENT_VERSION || "unknown" };
    cached = { expiresAt: Date.now() + 2000, body, status: 503 };
    return Response.json(body, { status: 503 });
  } finally {
    await Promise.all([outboxQueue.close(), deadLetterQueue.close(), redis.quit()]);
  }
}
