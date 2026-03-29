import { getDbPool } from "@/src/lib/db";

let ensureDirectMessagingSchemaPromise: Promise<void> | null = null;

export async function ensureDirectMessagingSchema(): Promise<void> {
  if (!ensureDirectMessagingSchemaPromise) {
    ensureDirectMessagingSchemaPromise = (async () => {
      const pool = getDbPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS direct_messages (
          id UUID PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sender_name TEXT NOT NULL,
          ciphertext_b64 TEXT NOT NULL,
          iv_b64 TEXT NOT NULL,
          auth_tag_b64 TEXT NOT NULL,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS direct_message_files (
          id UUID PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sender_name TEXT NOT NULL,
          original_name TEXT NOT NULL,
          storage_name TEXT NOT NULL,
          file_size BIGINT NOT NULL,
          mime_type TEXT NOT NULL,
          is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
          encryption_key_version TEXT,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(
        "ALTER TABLE direct_message_files ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE",
      );
      await pool.query(
        "ALTER TABLE direct_message_files ADD COLUMN IF NOT EXISTS encryption_key_version TEXT",
      );

      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_direct_messages_workspace_recipient ON direct_messages(workspace_id, recipient_user_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(workspace_id, sender_user_id, recipient_user_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_direct_message_files_recipient ON direct_message_files(workspace_id, recipient_user_id)",
      );
    })().catch((error) => {
      ensureDirectMessagingSchemaPromise = null;
      throw error;
    });
  }

  await ensureDirectMessagingSchemaPromise;
}
