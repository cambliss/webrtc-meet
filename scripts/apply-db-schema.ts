import { readFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const schemaPath = path.resolve(process.cwd(), "db", "schema.sql");
  const schemaSql = await readFile(schemaPath, "utf8");

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(schemaSql);
    process.stdout.write(`Applied schema from ${schemaPath}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Schema apply failed: ${String(error)}\n`);
  process.exit(1);
});
