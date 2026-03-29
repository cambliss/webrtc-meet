import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { readSecureSharedFileBytes, uploadSecureSharedFile } from "@/src/lib/objectStorage";
import {
  decryptSecureBinary,
  encryptSecureBinary,
  getSecureFileEncryptionKeyByVersion,
  isSecureBinaryEnvelope,
} from "@/src/lib/secureMessaging";

loadEnv({ path: ".env.local" });
loadEnv();

type RotationArgs = {
  fromVersion: string;
  toVersion: string;
  workspaceId: string | null;
  limit: number;
  dryRun: boolean;
};

type DirectFileRow = {
  id: string;
  workspace_id: string;
  storage_name: string;
  mime_type: string;
  is_encrypted: boolean;
  encryption_key_version: string | null;
};

function parseArgs(argv: string[]): RotationArgs {
  let fromVersion = "v1";
  let toVersion = "v2";
  let workspaceId: string | null = null;
  let limit = 200;
  let dryRun = false;

  for (const arg of argv) {
    if (arg.startsWith("--from=")) {
      fromVersion = arg.slice("--from=".length).trim() || fromVersion;
      continue;
    }

    if (arg.startsWith("--to=")) {
      toVersion = arg.slice("--to=".length).trim() || toVersion;
      continue;
    }

    if (arg.startsWith("--workspace=")) {
      const value = arg.slice("--workspace=".length).trim();
      workspaceId = value || null;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.floor(parsed);
      }
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { fromVersion, toVersion, workspaceId, limit, dryRun };
}

function usage() {
  process.stdout.write(
    [
      "Usage: npm run secure-files:rotate-keys -- --from=v1 --to=v2 [--workspace=<workspace-id>] [--limit=200] [--dry-run]",
      "",
      "Examples:",
      "  npm run secure-files:rotate-keys -- --from=v1 --to=v2 --dry-run",
      "  npm run secure-files:rotate-keys -- --from=v1 --to=v2 --workspace=workspace-abc123",
      "",
    ].join("\n"),
  );
}

async function fetchCandidates(pool: Pool, args: RotationArgs): Promise<DirectFileRow[]> {
  if (args.workspaceId) {
    const result = await pool.query<DirectFileRow>(
      `
        SELECT
          id,
          workspace_id,
          storage_name,
          mime_type,
          is_encrypted,
          encryption_key_version
        FROM direct_message_files
        WHERE workspace_id = $1
          AND (is_encrypted = true OR encryption_key_version IS NULL)
          AND COALESCE(encryption_key_version, 'v1') = $2
        ORDER BY created_at ASC
        LIMIT $3
      `,
      [args.workspaceId, args.fromVersion, args.limit],
    );

    return result.rows;
  }

  const result = await pool.query<DirectFileRow>(
    `
      SELECT
        id,
        workspace_id,
        storage_name,
        mime_type,
        is_encrypted,
        encryption_key_version
      FROM direct_message_files
      WHERE (is_encrypted = true OR encryption_key_version IS NULL)
        AND COALESCE(encryption_key_version, 'v1') = $1
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [args.fromVersion, args.limit],
  );

  return result.rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  if (args.fromVersion === args.toVersion) {
    throw new Error("--from and --to versions must be different");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const fromKey = getSecureFileEncryptionKeyByVersion(args.fromVersion);
  if (!fromKey) {
    throw new Error(`Missing key for from-version: ${args.fromVersion}`);
  }

  const toKey = getSecureFileEncryptionKeyByVersion(args.toVersion);
  if (!toKey) {
    throw new Error(`Missing key for to-version: ${args.toVersion}`);
  }

  if (fromKey.equals(toKey)) {
    process.stdout.write("Warning: source and target keys are identical; rotation will only update key_version metadata.\n");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  let scanned = 0;
  let rotated = 0;
  let skipped = 0;
  let upgradedPlaintext = 0;
  let failed = 0;

  try {
    const rows = await fetchCandidates(pool, args);

    if (rows.length === 0) {
      process.stdout.write("No matching encrypted direct files found for rotation.\n");
      return;
    }

    process.stdout.write(
      `Rotation start: candidates=${rows.length}, from=${args.fromVersion}, to=${args.toVersion}, dryRun=${args.dryRun}\n`,
    );

    for (const row of rows) {
      scanned += 1;

      try {
        const payload = await readSecureSharedFileBytes({
          workspaceId: row.workspace_id,
          storageName: row.storage_name,
        });

        const plainBytes = isSecureBinaryEnvelope(payload)
          ? decryptSecureBinary(payload, fromKey)
          : payload;
        const nextPayload = encryptSecureBinary(plainBytes, toKey);

        if (!args.dryRun) {
          await uploadSecureSharedFile({
            workspaceId: row.workspace_id,
            storageName: row.storage_name,
            bytes: nextPayload,
            mimeType: "application/octet-stream",
          });

          await pool.query(
            `
              UPDATE direct_message_files
              SET encryption_key_version = $1,
                  is_encrypted = true
              WHERE id = $2
            `,
            [args.toVersion, row.id],
          );
        }

        if (!isSecureBinaryEnvelope(payload)) {
          upgradedPlaintext += 1;
          process.stdout.write(`UPGRADE ${row.id}: plaintext legacy file encrypted with ${args.toVersion}\n`);
        }

        rotated += 1;
      } catch (error) {
        failed += 1;
        process.stderr.write(`FAIL ${row.id}: ${String(error)}\n`);
      }
    }

    process.stdout.write(
      `Rotation done: scanned=${scanned}, rotated=${rotated}, upgradedPlaintext=${upgradedPlaintext}, skipped=${skipped}, failed=${failed}, dryRun=${args.dryRun}\n`,
    );

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Rotation failed: ${String(error)}\n`);
  process.exit(1);
});
