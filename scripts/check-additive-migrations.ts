import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const baseline = "20260902190000_reconcile_prisma_history";
const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
const forbidden = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];

async function main() {
  const directories = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name > baseline)
    .map((entry) => entry.name);
  for (const directory of directories) {
    const sql = await readFile(path.join(migrationsRoot, directory, "migration.sql"), "utf8");
    const executable = sql.replace(/--.*$/gm, "");
    const matched = forbidden.find((pattern) => pattern.test(executable));
    if (matched) throw new Error(`Unauthorized destructive statement in ${directory}: ${matched}`);
  }
  process.stdout.write(`Validated ${directories.length} additive migration(s).\n`);
}

void main();
