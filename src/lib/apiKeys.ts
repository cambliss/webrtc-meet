import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

export type WorkspaceApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateWorkspaceApiKey() {
  const prefix = `mk_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(24).toString("hex");
  const rawKey = `${prefix}.${secret}`;
  return {
    rawKey,
    prefix,
    hash: hashApiKey(rawKey),
  };
}

export async function createWorkspaceApiKey(params: {
  workspaceId: string;
  name: string;
  createdBy?: string | null;
  expiresAt?: Date | null;
}) {
  const pool = getDbPool();
  const generated = generateWorkspaceApiKey();

  await pool.query(
    `
    INSERT INTO workspace_api_keys (
      id,
      workspace_id,
      name,
      key_prefix,
      key_hash,
      created_by,
      created_at,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `,
    [
      randomUUID(),
      params.workspaceId,
      params.name,
      generated.prefix,
      generated.hash,
      params.createdBy || null,
      params.expiresAt || null,
    ],
  );

  return {
    apiKey: generated.rawKey,
    keyPrefix: generated.prefix,
  };
}

export async function listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    `
    SELECT id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at
    FROM workspace_api_keys
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    `,
    [workspaceId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }));
}

export async function revokeWorkspaceApiKey(workspaceId: string, keyId: string): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query(
    `
    UPDATE workspace_api_keys
    SET revoked_at = NOW()
    WHERE id = $1
      AND workspace_id = $2
      AND revoked_at IS NULL
    `,
    [keyId, workspaceId],
  );

  return (result.rowCount || 0) > 0;
}

export async function resolveWorkspaceByApiKey(rawKey: string): Promise<{
  workspaceId: string;
  keyId: string;
} | null> {
  const prefix = rawKey.split(".")[0] || "";
  if (!prefix) {
    return null;
  }

  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    key_hash: string;
  }>(
    `
    SELECT id, workspace_id, key_hash
    FROM workspace_api_keys
    WHERE key_prefix = $1
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
    `,
    [prefix],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const hash = hashApiKey(rawKey);
  if (hash !== row.key_hash) {
    return null;
  }

  await pool.query(
    `
    UPDATE workspace_api_keys
    SET last_used_at = NOW()
    WHERE id = $1
    `,
    [row.id],
  );

  return {
    workspaceId: row.workspace_id,
    keyId: row.id,
  };
}
