import { readFile } from "node:fs/promises";

type TableInvariant = { exists: boolean; count: number; digest: string };
type Snapshot = {
  format: string;
  tables: Record<string, TableInvariant>;
  orphanChecks: Record<string, number>;
};

async function readSnapshot(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as Snapshot;
}

async function main() {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) throw new Error("Usage: compare-invariants.ts BEFORE.json AFTER.json");
  const before = await readSnapshot(beforePath);
  const after = await readSnapshot(afterPath);
  if (before.format !== "crm-b16-invariants-v1" || after.format !== before.format) {
    throw new Error("Unsupported invariant snapshot format.");
  }

  const failures: string[] = [];
  for (const [table, expected] of Object.entries(before.tables)) {
    const actual = after.tables[table];
    if (!actual) {
      failures.push(`${table}: missing from after snapshot`);
      continue;
    }
    if (!expected.exists) {
      if (actual.count !== 0) failures.push(`${table}: newly created table is not empty`);
      continue;
    }
    if (!actual.exists || actual.count !== expected.count || actual.digest !== expected.digest) {
      failures.push(`${table}: count or SHA-256 digest changed`);
    }
  }
  for (const [check, beforeCount] of Object.entries(before.orphanChecks)) {
    const afterCount = after.orphanChecks[check];
    if (afterCount !== beforeCount) failures.push(`${check}: orphan count changed (${beforeCount} -> ${afterCount})`);
  }
  if (failures.length) throw new Error(`Invariant verification failed:\n- ${failures.join("\n- ")}`);
  process.stdout.write("Invariant verification passed: protected rows and orphan counts are unchanged.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
