import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordProviderEvent } from "@/lib/channels/events";
import { allowWebhookRequest, correlationId, foundationEnabled, readRawBody, verifyHmacSha256 } from "@/lib/channels/webhook-gateway";

export const runtime = "nodejs";

type MetaPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: { metadata?: { phone_number_id?: string }; id?: string };
    }>;
  }>;
};

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
  const client = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!allowWebhookRequest(`meta:${client}`)) return Response.json({ error: "RATE_LIMITED", correlation }, { status: 429 });
  try {
    const raw = await readRawBody(request);
    if (!verifyHmacSha256(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
      return Response.json({ error: "INVALID_SIGNATURE", correlation }, { status: 401 });
    }
    const body = JSON.parse(raw.toString("utf8")) as MetaPayload;
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const phoneNumberId = change?.value?.metadata?.phone_number_id;
    const connection = await prisma.channelConnection.findFirst({
      where: { provider: { in: ["META_WHATSAPP", "META_INSTAGRAM"] }, isActive: true, OR: [{ externalPhoneNumberId: phoneNumberId }, { externalPageId: entry?.id }, { externalInstagramAccountId: entry?.id }] },
    });
    if (!connection || !(await foundationEnabled(connection.projectId))) return Response.json({ status: "DISABLED", correlation }, { status: 202 });
    const externalKey = change?.value?.id || request.headers.get("x-meta-event-id") || `sha256:${createHashForKey(raw)}`;
    const result = await recordProviderEvent({ connectionId: connection.id, externalEventKey: externalKey, eventType: change?.field || "unknown", rawBody: raw.toString("utf8") });
    return Response.json({ status: result.duplicate ? "DUPLICATE" : "ACCEPTED", correlation }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    return Response.json({ error: code === "BODY_TOO_LARGE" ? code : "INVALID_REQUEST", correlation }, { status: code === "BODY_TOO_LARGE" ? 413 : 400 });
  }
}

function createHashForKey(raw: Buffer) {
  return createHash("sha256").update(raw).digest("hex");
}
