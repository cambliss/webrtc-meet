import { randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

export type SecureWorkspaceMessageRow = {
  id: string;
  workspaceId: string;
  senderUserId: string;
  senderName: string;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  createdAt: string;
};

export async function ensureSecureMessagingSchema(): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Serialize this DDL block across concurrent requests/workers.
    await client.query("SELECT pg_advisory_xact_lock($1)", [980214573]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_secure_messages (
        id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_name TEXT NOT NULL,
        ciphertext_b64 TEXT NOT NULL,
        iv_b64 TEXT NOT NULL,
        auth_tag_b64 TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_secure_messages_workspace_created
      ON workspace_secure_messages(workspace_id, created_at DESC)
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listWorkspaceSecureMessages(
  workspaceId: string,
  limit = 80,
): Promise<SecureWorkspaceMessageRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    sender_user_id: string;
    sender_name: string;
    ciphertext_b64: string;
    iv_b64: string;
    auth_tag_b64: string;
    created_at: string;
  }>(
    `
    SELECT
      id::text,
      workspace_id,
      sender_user_id,
      sender_name,
      ciphertext_b64,
      iv_b64,
      auth_tag_b64,
      created_at
    FROM workspace_secure_messages
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [workspaceId, safeLimit],
  );

  return result.rows
    .map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      senderUserId: row.sender_user_id,
      senderName: row.sender_name,
      ciphertextB64: row.ciphertext_b64,
      ivB64: row.iv_b64,
      authTagB64: row.auth_tag_b64,
      createdAt: row.created_at,
    }))
    .reverse();
}

export async function createWorkspaceSecureMessage(params: {
  workspaceId: string;
  senderUserId: string;
  senderName: string;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
}): Promise<SecureWorkspaceMessageRow> {
  const pool = getDbPool();
  const id = randomUUID();
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    sender_user_id: string;
    sender_name: string;
    ciphertext_b64: string;
    iv_b64: string;
    auth_tag_b64: string;
    created_at: string;
  }>(
    `
    INSERT INTO workspace_secure_messages (
      id,
      workspace_id,
      sender_user_id,
      sender_name,
      ciphertext_b64,
      iv_b64,
      auth_tag_b64,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING
      id::text,
      workspace_id,
      sender_user_id,
      sender_name,
      ciphertext_b64,
      iv_b64,
      auth_tag_b64,
      created_at
    `,
    [
      id,
      params.workspaceId,
      params.senderUserId,
      params.senderName,
      params.ciphertextB64,
      params.ivB64,
      params.authTagB64,
    ],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    ciphertextB64: row.ciphertext_b64,
    ivB64: row.iv_b64,
    authTagB64: row.auth_tag_b64,
    createdAt: row.created_at,
  };
}
