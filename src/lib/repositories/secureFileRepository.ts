import { randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

export type SecureWorkspaceFileRow = {
  id: string;
  workspaceId: string;
  uploaderUserId: string;
  uploaderName: string;
  originalName: string;
  storageName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
};

const SCHEMA_LOCK_ID = 980214574;

export async function ensureSecureFileSchema(): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_secure_files (
        id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        uploader_name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        storage_name TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_secure_files_workspace_created
      ON workspace_secure_files(workspace_id, created_at DESC)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_secure_files_storage_name
      ON workspace_secure_files(storage_name)
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listWorkspaceSecureFiles(
  workspaceId: string,
  limit = 100,
): Promise<SecureWorkspaceFileRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 300);
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    uploader_user_id: string;
    uploader_name: string;
    original_name: string;
    storage_name: string;
    file_size: string;
    mime_type: string;
    created_at: string;
  }>(
    `
    SELECT
      id::text,
      workspace_id,
      uploader_user_id,
      uploader_name,
      original_name,
      storage_name,
      file_size::text,
      mime_type,
      created_at
    FROM workspace_secure_files
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [workspaceId, safeLimit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    uploaderUserId: row.uploader_user_id,
    uploaderName: row.uploader_name,
    originalName: row.original_name,
    storageName: row.storage_name,
    fileSize: Number(row.file_size),
    mimeType: row.mime_type,
    createdAt: row.created_at,
  }));
}

export async function createWorkspaceSecureFile(params: {
  workspaceId: string;
  uploaderUserId: string;
  uploaderName: string;
  originalName: string;
  storageName: string;
  fileSize: number;
  mimeType: string;
}): Promise<SecureWorkspaceFileRow> {
  const pool = getDbPool();
  const id = randomUUID();
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    uploader_user_id: string;
    uploader_name: string;
    original_name: string;
    storage_name: string;
    file_size: string;
    mime_type: string;
    created_at: string;
  }>(
    `
    INSERT INTO workspace_secure_files (
      id,
      workspace_id,
      uploader_user_id,
      uploader_name,
      original_name,
      storage_name,
      file_size,
      mime_type,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING
      id::text,
      workspace_id,
      uploader_user_id,
      uploader_name,
      original_name,
      storage_name,
      file_size::text,
      mime_type,
      created_at
    `,
    [
      id,
      params.workspaceId,
      params.uploaderUserId,
      params.uploaderName,
      params.originalName,
      params.storageName,
      params.fileSize,
      params.mimeType,
    ],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    uploaderUserId: row.uploader_user_id,
    uploaderName: row.uploader_name,
    originalName: row.original_name,
    storageName: row.storage_name,
    fileSize: Number(row.file_size),
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export async function getWorkspaceSecureFileById(
  workspaceId: string,
  fileId: string,
): Promise<SecureWorkspaceFileRow | null> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    uploader_user_id: string;
    uploader_name: string;
    original_name: string;
    storage_name: string;
    file_size: string;
    mime_type: string;
    created_at: string;
  }>(
    `
    SELECT
      id::text,
      workspace_id,
      uploader_user_id,
      uploader_name,
      original_name,
      storage_name,
      file_size::text,
      mime_type,
      created_at
    FROM workspace_secure_files
    WHERE workspace_id = $1 AND id::text = $2
    LIMIT 1
    `,
    [workspaceId, fileId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    uploaderUserId: row.uploader_user_id,
    uploaderName: row.uploader_name,
    originalName: row.original_name,
    storageName: row.storage_name,
    fileSize: Number(row.file_size),
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export async function deleteWorkspaceSecureFileById(params: {
  workspaceId: string;
  fileId: string;
}): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query(
    `
    DELETE FROM workspace_secure_files
    WHERE workspace_id = $1
      AND id::text = $2
    `,
    [params.workspaceId, params.fileId],
  );

  return (result.rowCount || 0) > 0;
}
