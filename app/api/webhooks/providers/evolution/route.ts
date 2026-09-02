import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordProviderEvent } from "@/lib/channels/events";
import { allowWebhookRequest, clientOrigin, correlationId, foundationEnabled, parseWebhookJson, readRawBody } from "@/lib/channels/webhook-gateway";
import { createRedisConnection } from "@/lib/queues/connection";

export const runtime = "nodejs";

function validSecret(supplied: string | null) {
  const expected = process.env.EVOLUTION_FOUNDATION_WEBHOOK_SECRET;
  if (!supplied || !expected) return false;
  const a = Buffer.from(supplied.replace(/^Bearer\s+/i, "")); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const correlation = correlationId(request);
  const redis = createRedisConnection();
  const originLimit = await allowWebhookRequest(redis, "evolution", "origin", clientOrigin(request), Number(process.env.WEBHOOK_RATE_LIMIT_ORIGIN || 120));
  if (!originLimit.allowed) { await redis.quit(); return Response.json({ error: originLimit.code, correlation }, { status: originLimit.code === "RATE_LIMITED" ? 429 : 503 }); }
  if (!validSecret(request.headers.get("webhook-authorization") || request.headers.get("authorization"))) {
    await redis.quit();
    return Response.json({ error: "INVALID_SIGNATURE", correlation }, { status: 401 });
  }
  try {
    const raw = await readRawBody(request);
    const body = parseWebhookJson<{ instance?: string; event?: string; data?: { key?: { id?: string } } }>(raw);
    const connection = await prisma.channelConnection.findFirst({ where: { provider: "EVOLUTION", externalBusinessId: body.instance, isActive: true } });
    if (!connection || !(await foundationEnabled(connection.projectId))) return Response.json({ status: "DISABLED", correlation }, { status: 202 });
    const connectionLimit = await allowWebhookRequest(redis, "evolution", "connection", connection.id, Number(process.env.WEBHOOK_RATE_LIMIT_CONNECTION || 600));
    if (!connectionLimit.allowed) return Response.json({ error: connectionLimit.code, correlation }, { status: connectionLimit.code === "RATE_LIMITED" ? 429 : 503 });
    const externalKey = body.data?.key?.id || createHash("sha256").update(raw).digest("hex");
    const result = await recordProviderEvent({ connectionId: connection.id, externalEventKey: externalKey, eventType: body.event || "unknown", rawBody: raw.toString("utf8") });
    return Response.json({ status: result.duplicate ? "DUPLICATE" : "ACCEPTED", correlation }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    return Response.json({ error: code === "BODY_TOO_LARGE" ? code : "INVALID_REQUEST", correlation }, { status: code === "BODY_TOO_LARGE" ? 413 : 400 });
  } finally { await redis.quit(); }
}
