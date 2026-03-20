import { getDbPool } from "@/src/lib/db";

type StartIdempotentRequestResult =
  | { state: "created" }
  | { state: "replay"; statusCode: number; responseBody: unknown }
  | { state: "processing" }
  | { state: "conflict" };

export async function startIdempotentRequest(params: {
  scope: string;
  actorKey: string;
  idempotencyKey: string;
  requestHash: string;
  ttlSeconds?: number;
}): Promise<StartIdempotentRequestResult> {
  const pool = getDbPool();
  const safeTtlSeconds = Math.max(60, params.ttlSeconds || 6 * 60 * 60);

  await pool.query(
    `
    INSERT INTO api_idempotency_keys (
      scope,
      actor_key,
      idempotency_key,
      request_hash,
      response_status,
      response_body,
      created_at,
      updated_at,
      expires_at
    )
    VALUES ($1, $2, $3, $4, NULL, NULL, NOW(), NOW(), NOW() + ($5::text || ' seconds')::interval)
    ON CONFLICT (scope, actor_key, idempotency_key)
    DO NOTHING
    `,
    [params.scope, params.actorKey, params.idempotencyKey, params.requestHash, safeTtlSeconds],
  );

  const result = await pool.query<{
    request_hash: string;
    response_status: number | null;
    response_body: unknown;
  }>(
    `
    SELECT request_hash, response_status, response_body
    FROM api_idempotency_keys
    WHERE scope = $1
      AND actor_key = $2
      AND idempotency_key = $3
      AND expires_at > NOW()
    LIMIT 1
    `,
    [params.scope, params.actorKey, params.idempotencyKey],
  );

  const row = result.rows[0];
  if (!row) {
    return { state: "created" };
  }

  if (row.request_hash !== params.requestHash) {
    return { state: "conflict" };
  }

  if (typeof row.response_status === "number") {
    return {
      state: "replay",
      statusCode: row.response_status,
      responseBody: row.response_body,
    };
  }

  const lockResult = await pool.query<{ response_status: number | null; response_body: unknown }>(
    `
    UPDATE api_idempotency_keys
    SET updated_at = NOW()
    WHERE scope = $1
      AND actor_key = $2
      AND idempotency_key = $3
      AND request_hash = $4
      AND response_status IS NULL
    RETURNING response_status, response_body
    `,
    [params.scope, params.actorKey, params.idempotencyKey, params.requestHash],
  );

  if ((lockResult.rowCount || 0) > 0) {
    return { state: "created" };
  }

  return { state: "processing" };
}

export async function completeIdempotentRequest(params: {
  scope: string;
  actorKey: string;
  idempotencyKey: string;
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
}): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE api_idempotency_keys
    SET
      response_status = $5,
      response_body = $6::jsonb,
      updated_at = NOW()
    WHERE scope = $1
      AND actor_key = $2
      AND idempotency_key = $3
      AND request_hash = $4
    `,
    [
      params.scope,
      params.actorKey,
      params.idempotencyKey,
      params.requestHash,
      params.statusCode,
      JSON.stringify(params.responseBody),
    ],
  );
}

export async function abandonIdempotentRequest(params: {
  scope: string;
  actorKey: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    DELETE FROM api_idempotency_keys
    WHERE scope = $1
      AND actor_key = $2
      AND idempotency_key = $3
      AND request_hash = $4
      AND response_status IS NULL
    `,
    [params.scope, params.actorKey, params.idempotencyKey, params.requestHash],
  );
}
