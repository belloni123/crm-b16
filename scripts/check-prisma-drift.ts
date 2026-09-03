import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const PARTIAL_INDEX = "Message_channelConnectionId_providerMessageId_unique_not_null";
const EXPECTED_DEFINITION = /CREATE UNIQUE INDEX .* ON public\."Message" USING btree \("channelConnectionId", "providerMessageId"\) WHERE \(\("channelConnectionId" IS NOT NULL\) AND \("providerMessageId" IS NOT NULL\)\)/;

function executableStatements(sql: string) {
  return sql
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = new PrismaClient();
  try {
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${PARTIAL_INDEX}
    `;
    if (indexes.length !== 1 || !EXPECTED_DEFINITION.test(indexes[0].indexdef)) {
      throw new Error(`Managed partial index ${PARTIAL_INDEX} is absent or has an unexpected definition.`);
    }
  } finally {
    await prisma.$disconnect();
  }

  const output = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "diff", "--from-url", process.env.DATABASE_URL, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { encoding: "utf8", env: process.env },
  );
  const statements = executableStatements(output);
  const allowed = new Set([`DROP INDEX "${PARTIAL_INDEX}"`]);
  const unauthorized = statements.filter((statement) => !allowed.has(statement));
  if (unauthorized.length > 0) {
    throw new Error(`Unauthorized Prisma drift detected:\n${unauthorized.join(";\n")}`);
  }
  process.stdout.write(`Prisma drift gate passed (${statements.length} documented unmanaged partial index statement).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
