import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { queuePrefix } from "@/lib/env";

const MAX_BODY_BYTES = 1_048_576;
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

export async function allowWebhookRequest(redis: IORedis, provider: string, scope: "origin" | "connection", identifier: string, limit = 120, windowMs = 60_000) {
  const safeIdentifier = createHmac("sha256", queuePrefix()).update(identifier).digest("hex").slice(0, 32);
  const key = `${queuePrefix()}:rate-limit:${provider}:${scope}:${safeIdentifier}`;
  try {
    const [count, ttl] = await redis.eval(RATE_LIMIT_LUA, 1, key, windowMs) as [number, number];
    return { allowed: count <= limit, count, retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)), code: count <= limit ? "RATE_LIMIT_OK" : "RATE_LIMITED" };
  } catch {
    return { allowed: false, count: 0, retryAfterSeconds: 5, code: "RATE_LIMIT_UNAVAILABLE" };
  }
}

export async function readRawBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  return bytes;
}

export function verifyHmacSha256(raw: Buffer, signature: string | null, secret: string | undefined) {
  if (!signature || !secret) return false;
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const supplied = signature.slice(7);
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function timingSafeTextEqual(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyEvolutionWebhookAuth(raw: Buffer, headers: Headers, secret: string | undefined) {
  if (!secret) return false;
  if (verifyHmacSha256(raw, headers.get("x-hub-signature-256"), secret)) return true;
  const authorization = headers.get("webhook-authorization") || headers.get("apikey") || headers.get("authorization");
  return timingSafeTextEqual(authorization?.replace(/^Bearer\s+/i, "") || null, secret);
}

export function clientOrigin(request: Request) {
  if (process.env.TRUST_PROXY !== "true") return "untrusted-proxy";
  const candidates = [request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()];
  return candidates.find((value) => value && isIP(value)) || "unknown";
}

function assertJsonDepth(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error("JSON_TOO_DEEP");
  if (Array.isArray(value)) {
    if (value.length > 1000) throw new Error("JSON_ARRAY_TOO_LARGE");
    for (const item of value) assertJsonDepth(item, depth + 1);
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 500) throw new Error("JSON_OBJECT_TOO_LARGE");
    for (const [, item] of entries) assertJsonDepth(item, depth + 1);
  }
}

export function parseWebhookJson<T>(raw: Buffer): T {
  const value = JSON.parse(raw.toString("utf8")) as T;
  assertJsonDepth(value);
  return value;
}

export async function foundationEnabled(projectId: string) {
  const feature = await prisma.projectFeature.findUnique({ where: { projectId_key: { projectId, key: "omnichannel_foundation" } } });
  return feature?.enabled === true;
}

export function correlationId(request: Request) {
  return request.headers.get("x-correlation-id") || randomUUID();
}
