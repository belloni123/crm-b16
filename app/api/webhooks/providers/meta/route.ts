import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordProviderEvent } from "@/lib/channels/events";
import { allowWebhookRequest, clientOrigin, correlationId, parseWebhookJson, readRawBody, verifyHmacSha256 } from "@/lib/channels/webhook-gateway";
import { createRedisConnection } from "@/lib/queues/connection";
import { eachMetaChange, metaChangeKey, type MetaWebhookPayload } from "@/lib/channels/meta/payload";

export const runtime = "nodejs";

function equalText(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") || "";
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || "";
  if (mode !== "subscribe" || !expected || !equalText(token, expected)) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const correlation = correlationId(request);
  const redis = createRedisConnection();
  try {
    const originLimit = await allowWebhookRequest(redis, "meta", "origin", clientOrigin(request), Number(process.env.WEBHOOK_RATE_LIMIT_ORIGIN || 120));
    if (!originLimit.allowed) return Response.json({ error: originLimit.code, correlation }, { status: originLimit.code === "RATE_LIMITED" ? 429 : 503, headers: { "retry-after": String(originLimit.retryAfterSeconds) } });
    const raw = await readRawBody(request);
    if (!verifyHmacSha256(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
      return Response.json({ error: "INVALID_SIGNATURE", correlation }, { status: 401 });
    }
    const body = parseWebhookJson<MetaWebhookPayload>(raw);
    if (body.object !== "whatsapp_business_account") return Response.json({ error: "UNSUPPORTED_META_OBJECT", correlation }, { status: 400 });
    let accepted = 0;
    let duplicates = 0;
    let unknown = 0;
    for (const { entry, entryIndex, change, changeIndex } of eachMetaChange(body)) {
        if (change.field !== "messages") continue;
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!entry.id || !phoneNumberId) { unknown += 1; continue; }
        const connections = await prisma.channelConnection.findMany({
          where: { provider: "META_WHATSAPP", channel: "WHATSAPP", isActive: true, externalWabaId: entry.id, externalPhoneNumberId: phoneNumberId },
          take: 2,
        });
        if (connections.length > 1) return Response.json({ error: "AMBIGUOUS_META_CONNECTION", correlation }, { status: 409 });
        const connection = connections[0];
        if (!connection) { unknown += 1; continue; }
        const connectionLimit = await allowWebhookRequest(redis, "meta", "connection", connection.id, Number(process.env.WEBHOOK_RATE_LIMIT_CONNECTION || 600));
        if (!connectionLimit.allowed) return Response.json({ error: connectionLimit.code, correlation }, { status: connectionLimit.code === "RATE_LIMITED" ? 429 : 503, headers: { "retry-after": String(connectionLimit.retryAfterSeconds) } });
        const normalized = Buffer.from(JSON.stringify({ entryId: entry.id, change }));
        const externalKey = metaChangeKey(entry.id, change.value, entryIndex, changeIndex);
        const result = await recordProviderEvent({ connectionId: connection.id, externalEventKey: externalKey, eventType: change.field || "unknown", rawBody: normalized.toString("utf8") });
        if (result.duplicate) duplicates += 1;
        else accepted += 1;
    }
    return Response.json({ status: accepted ? "ACCEPTED" : duplicates ? "DUPLICATE" : "UNKNOWN_CONNECTION", accepted, duplicates, unknown, correlation }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    return Response.json({ error: code === "BODY_TOO_LARGE" ? code : "INVALID_REQUEST", correlation }, { status: code === "BODY_TOO_LARGE" ? 413 : 400 });
  } finally { await redis.quit(); }
}
