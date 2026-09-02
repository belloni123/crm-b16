import { prisma } from "@/lib/prisma";
import { createFoundationQueue } from "@/lib/queues";
import { isOutboundDisabled } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const outboxQueue = createFoundationQueue("outbox-dispatch");
  const deadLetterQueue = createFoundationQueue("dead-letter");
  try {
    const [pendingOutbox, outboxJobs, deadLetterJobs, enabledFeatures] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      outboxQueue.getJobCounts("waiting", "active", "failed", "completed"),
      deadLetterQueue.getJobCounts("waiting", "failed"),
      prisma.projectFeature.count({ where: { enabled: true } }),
    ]);
    return Response.json({
      status: "ok",
      outboundIntegrationsDisabled: isOutboundDisabled(),
      enabledFeatures,
      metrics: { pendingOutbox, outboxJobs, deadLetterJobs },
    });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  } finally {
    await Promise.all([outboxQueue.close(), deadLetterQueue.close()]);
  }
}
