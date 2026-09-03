import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { encryptChannelCredentials } from '@/lib/channels/credentials';
import { allowWebhookRequest, clientOrigin } from '@/lib/channels/webhook-gateway';
import { createRedisConnection } from '@/lib/queues/connection';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const redis = createRedisConnection();
  try {
    const limit = await allowWebhookRequest(redis, 'data-deletion', 'origin', clientOrigin(request), 10, 60 * 60_000);
    if (!limit.allowed) return Response.json({ error: limit.code }, { status: limit.code === 'RATE_LIMITED' ? 429 : 503 });
    const { email } = await request.json().catch(() => ({})) as { email?: string };
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return Response.json({ error: 'INVALID_EMAIL' }, { status: 400 });
    const requesterHash = createHash('sha256').update(normalized).digest('hex');
    const recent = await prisma.dataDeletionRequest.findFirst({ where: { requesterHash, createdAt: { gt: new Date(Date.now() - 86_400_000) } }, orderBy: { createdAt: 'desc' } });
    const row = recent || await prisma.dataDeletionRequest.create({ data: { requesterHash, requesterEncrypted: encryptChannelCredentials({ email: normalized }) } });
    return Response.json({ status: 'RECEIVED', reference: row.id }, { status: recent ? 200 : 201 });
  } finally { await redis.quit(); }
}
