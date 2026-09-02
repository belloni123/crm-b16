import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const protectedTables = [
  "Project", "Lead", "PipelineEntry", "Conversation", "Message", "Activity",
  "Task", "Tag", "CustomFieldDefinition", "CustomFieldValue", "WebhookEndpoint",
  "WebhookLog", "Form", "FormField", "CalendarIntegration",
] as const;

type Snapshot = {
  format: "crm-b16-invariants-v1";
  tables: Record<string, { exists: boolean; count: number; digest: string }>;
  orphanChecks: Record<string, number>;
};

function assertSafeTarget() {
  const scope = process.env.DB_SAFETY_SCOPE;
  if (scope !== "isolated" && scope !== "staging") {
    throw new Error("DB_SAFETY_SCOPE must be 'isolated' or 'staging'. Production is intentionally unsupported.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
}

function digestRows(rows: unknown[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function tableExists(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    table,
  );
  return Boolean(rows[0]?.exists);
}

async function captureTable(prisma: PrismaClient, table: string) {
  if (!(await tableExists(prisma, table))) {
    return { exists: false, count: 0, digest: digestRows([]) };
  }
  // Values never leave this process in clear text; only a SHA-256 digest is emitted.
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY t."id"`,
  );
  return { exists: true, count: rows.length, digest: digestRows(rows) };
}

async function orphanCount(prisma: PrismaClient, name: string, sql: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql);
    return [name, Number(rows[0]?.count ?? 0)] as const;
  } catch (error) {
    if (error instanceof Error && /does not exist/.test(error.message)) return [name, 0] as const;
    throw error;
  }
}

async function main() {
  assertSafeTarget();
  const prisma = new PrismaClient();
  try {
    const tablePairs = await Promise.all(
      protectedTables.map(async (table) => [table, await captureTable(prisma, table)] as const),
    );
    const orphanPairs = await Promise.all([
      orphanCount(prisma, "lead_project", `SELECT count(*)::bigint AS count FROM "Lead" l LEFT JOIN "Project" p ON p.id=l."projectId" WHERE p.id IS NULL`),
      orphanCount(prisma, "pipeline_entry_lead", `SELECT count(*)::bigint AS count FROM "PipelineEntry" e LEFT JOIN "Lead" l ON l.id=e."leadId" WHERE l.id IS NULL`),
      orphanCount(prisma, "pipeline_entry_pipeline", `SELECT count(*)::bigint AS count FROM "PipelineEntry" e LEFT JOIN "Pipeline" p ON p.id=e."pipelineId" WHERE p.id IS NULL`),
      orphanCount(prisma, "pipeline_entry_stage", `SELECT count(*)::bigint AS count FROM "PipelineEntry" e LEFT JOIN "Stage" s ON s.id=e."stageId" WHERE s.id IS NULL`),
      orphanCount(prisma, "conversation_lead", `SELECT count(*)::bigint AS count FROM "Conversation" c LEFT JOIN "Lead" l ON l.id=c."leadId" WHERE c."leadId" IS NOT NULL AND l.id IS NULL`),
      orphanCount(prisma, "message_conversation", `SELECT count(*)::bigint AS count FROM "Message" m LEFT JOIN "Conversation" c ON c.id=m."conversationId" WHERE c.id IS NULL`),
    ]);
    const snapshot: Snapshot = {
      format: "crm-b16-invariants-v1",
      tables: Object.fromEntries(tablePairs),
      orphanChecks: Object.fromEntries(orphanPairs),
    };
    const output = `${JSON.stringify(snapshot, null, 2)}\n`;
    const outputPath = process.argv[2];
    if (outputPath) await writeFile(outputPath, output, { mode: 0o600 });
    else process.stdout.write(output);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
