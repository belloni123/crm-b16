import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ensureEvolutionConnection, linkLegacyConversation, linkLegacyMessage, type CompatibilityConflict } from "../lib/channels/evolution-compatibility";

type Counts = {
  instances: number;
  connectionsCreated: number;
  conversations: number;
  messages: number;
  identitiesCreated: number;
  conflicts: Record<CompatibilityConflict, number>;
};

const prisma = new PrismaClient();
const scope = process.env.DB_SAFETY_SCOPE;
const dryRun = process.argv.includes("--dry-run");
const batchSize = Math.min(500, Math.max(1, Number(process.env.BACKFILL_BATCH_SIZE || 50)));
const timeoutMs = Math.max(10_000, Number(process.env.BACKFILL_TIMEOUT_MS || 900_000));
const stopAfterBatches = Math.max(0, Number(process.env.BACKFILL_STOP_AFTER_BATCHES || 0));
const checkpointKey = `${scope}:evolution-foundation-v1`;
let cancelled = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { cancelled = true; });

function assertSafeTarget() {
  if (scope !== "isolated" && scope !== "staging") throw new Error("DB_SAFETY_SCOPE must be isolated or staging; production is refused.");
  if (process.env.DEPLOYMENT_ENV === "production") throw new Error("Backfill refused for DEPLOYMENT_ENV=production.");
  if (process.env.BACKFILL_TARGET_CONFIRMATION !== `${scope}:evolution-foundation`) throw new Error("BACKFILL_TARGET_CONFIRMATION does not match the isolated/staging target.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
}

function emptyCounts(): Counts {
  return {
    instances: 0, connectionsCreated: 0, conversations: 0, messages: 0, identitiesCreated: 0,
    conflicts: {
      CONVERSATION_WITHOUT_LEAD: 0,
      CONVERSATION_LEAD_PROJECT_MISMATCH: 0,
      MESSAGE_WITHOUT_REMOTE_ID: 0,
      REMOTE_ID_DUPLICATE_SAME_CONNECTION: 0,
      REMOTE_ID_DUPLICATE_ACROSS_CONNECTIONS: 0,
    },
  };
}

function addConflicts(counts: Counts, conflicts: CompatibilityConflict[]) {
  for (const conflict of new Set(conflicts)) counts.conflicts[conflict] += 1;
}

async function technicalHash(table: "WhatsAppInstance" | "Conversation" | "Message") {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "${table}" ORDER BY "id"`);
  return createHash("sha256").update(rows.map((row) => row.id).join("\n")).digest("hex");
}

async function dryRunReport(counts: Counts) {
  counts.instances = await prisma.whatsAppInstance.count();
  counts.conversations = await prisma.conversation.count();
  counts.messages = await prisma.message.count();
  counts.conflicts.CONVERSATION_WITHOUT_LEAD = await prisma.conversation.count({ where: { leadId: null } });
  counts.conflicts.MESSAGE_WITHOUT_REMOTE_ID = await prisma.message.count({ where: { remoteId: null } });
  const projectMismatch = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM "Conversation" c
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    JOIN "Lead" l ON l.id=c."leadId"
    WHERE l."projectId" <> i."projectId"
  `;
  counts.conflicts.CONVERSATION_LEAD_PROJECT_MISMATCH = Number(projectMismatch[0]?.count || 0);
}

async function main() {
  assertSafeTarget();
  const startedAt = Date.now();
  const counts = emptyCounts();
  const beforeHashes = {
    instances: await technicalHash("WhatsAppInstance"),
    conversations: await technicalHash("Conversation"),
    messages: await technicalHash("Message"),
  };
  if (dryRun) {
    await dryRunReport(counts);
    process.stdout.write(`${JSON.stringify({ event: "evolution_backfill_dry_run", counts, beforeHashes, durationMs: Date.now() - startedAt })}\n`);
    return;
  }

  const previous = await prisma.backfillCheckpoint.findUnique({ where: { key: checkpointKey } });
  let cursor = previous?.status === "RUNNING" || previous?.status === "CANCELLED" ? previous.cursor : null;
  let completedBatches = 0;
  await prisma.backfillCheckpoint.upsert({
    where: { key: checkpointKey },
    update: { status: "RUNNING", completedAt: null },
    create: { key: checkpointKey, status: "RUNNING" },
  });

  while (!cancelled) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("BACKFILL_TIMEOUT");
    const instances = await prisma.whatsAppInstance.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (!instances.length) break;
    for (const instance of instances) {
      if (cancelled) break;
      const existed = await prisma.channelConnection.findUnique({ where: { legacyWhatsAppInstanceId: instance.id }, select: { id: true } });
      await prisma.$transaction(async (tx) => { await ensureEvolutionConnection(tx, instance); }, { timeout: Math.min(timeoutMs, 30_000) });
      counts.instances += 1;
      if (!existed) counts.connectionsCreated += 1;
      const conversations = await prisma.conversation.findMany({ where: { instanceId: instance.id }, orderBy: { id: "asc" } });
      for (const conversation of conversations) {
        const identityBefore = await prisma.contactIdentity.findFirst({ where: { channelConnection: { legacyWhatsAppInstanceId: instance.id }, externalUserId: conversation.whatsappId }, select: { id: true } });
        const linked = await prisma.$transaction((tx) => linkLegacyConversation(tx, instance, conversation), { timeout: Math.min(timeoutMs, 30_000) });
        counts.conversations += 1;
        if (!identityBefore) counts.identitiesCreated += 1;
        addConflicts(counts, linked.conflicts);
        const messages = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { id: "asc" } });
        for (const message of messages) {
          const result = await prisma.$transaction((tx) => linkLegacyMessage(tx, instance, conversation, message), { timeout: Math.min(timeoutMs, 30_000) });
          counts.messages += 1;
          addConflicts(counts, result.conflicts);
        }
      }
      cursor = instance.id;
      await prisma.backfillCheckpoint.update({ where: { key: checkpointKey }, data: { cursor, countsJson: JSON.stringify({ ...counts, conflicts: undefined }), conflictsJson: JSON.stringify(counts.conflicts) } });
      process.stdout.write(`${JSON.stringify({ event: "evolution_backfill_progress", instances: counts.instances, conversations: counts.conversations, messages: counts.messages })}\n`);
    }
    completedBatches += 1;
    if (stopAfterBatches && completedBatches >= stopAfterBatches) cancelled = true;
  }

  const status = cancelled ? "CANCELLED" : "COMPLETED";
  await prisma.backfillCheckpoint.update({ where: { key: checkpointKey }, data: { status, cursor, completedAt: cancelled ? null : new Date(), countsJson: JSON.stringify({ ...counts, conflicts: undefined }), conflictsJson: JSON.stringify(counts.conflicts) } });
  const afterHashes = {
    instances: await technicalHash("WhatsAppInstance"),
    conversations: await technicalHash("Conversation"),
    messages: await technicalHash("Message"),
  };
  if (JSON.stringify(beforeHashes) !== JSON.stringify(afterHashes)) throw new Error("LEGACY_ID_SET_CHANGED");
  process.stdout.write(`${JSON.stringify({ event: "evolution_backfill_complete", status, counts, hashes: afterHashes, durationMs: Date.now() - startedAt })}\n`);
  if (cancelled) process.exitCode = 130;
}

main().catch((error) => { console.error(JSON.stringify({ event: "evolution_backfill_failed", errorCode: error instanceof Error ? error.message : "UNKNOWN" })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
