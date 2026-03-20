import { getDbPool } from "@/src/lib/db";
import { deleteSecureSharedFile } from "@/src/lib/objectStorage";

type SecureFileCandidate = {
  id: string;
  workspace_id: string;
  storage_name: string;
};

async function main() {
  const retentionDays = Math.max(1, Number(process.env.SECURE_FILES_RETENTION_DAYS || "30"));
  const limit = Math.min(2000, Math.max(1, Number(process.env.SECURE_FILES_RETENTION_BATCH || "500")));

  const pool = getDbPool();
  const result = await pool.query<SecureFileCandidate>(
    `
    SELECT id::text, workspace_id, storage_name
    FROM workspace_secure_files
    WHERE created_at < NOW() - ($1::text || ' days')::interval
    ORDER BY created_at ASC
    LIMIT $2
    `,
    [retentionDays, limit],
  );

  let deleted = 0;
  let skipped = 0;

  for (const row of result.rows) {
    try {
      await deleteSecureSharedFile({
        workspaceId: row.workspace_id,
        storageName: row.storage_name,
      }).catch(() => undefined);

      const deleteResult = await pool.query(
        `
        DELETE FROM workspace_secure_files
        WHERE id::text = $1
        `,
        [row.id],
      );

      if ((deleteResult.rowCount || 0) > 0) {
        deleted += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  process.stdout.write(
    `Secure files cleanup complete. candidates=${result.rows.length} deleted=${deleted} skipped=${skipped}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Secure files cleanup failed: ${String(error)}\n`);
  process.exit(1);
});
