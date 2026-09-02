import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const MAX_BODY_BYTES = 1_048_576;
const windows = new Map<string, { count: number; resetAt: number }>();

export function allowWebhookRequest(key: string, limit = 120) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
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
  const supplied = signature.replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export async function foundationEnabled(projectId: string) {
  const feature = await prisma.projectFeature.findUnique({ where: { projectId_key: { projectId, key: "omnichannel_foundation" } } });
  return feature?.enabled === true;
}

export function correlationId(request: Request) {
  return request.headers.get("x-correlation-id") || randomUUID();
}
