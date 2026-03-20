import { randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

export type BackgroundJobType = "meeting_end";

export type BackgroundJobRecord = {
  id: string;
  jobType: BackgroundJobType;
  payload: unknown;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lastError: string | null;
  claimedAt: string | null;
  claimedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  job_type: BackgroundJobType;
  payload: unknown;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}): BackgroundJobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    lastError: row.last_error,
    claimedAt: row.claimed_at,
    claimedBy: row.claimed_by,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function enqueueBackgroundJob(params: {
  jobType: BackgroundJobType;
  payload: unknown;
  maxAttempts?: number;
  runAfter?: Date;
}): Promise<BackgroundJobRecord> {
  const pool = getDbPool();
  const id = randomUUID();

  const result = await pool.query<{
    id: string;
    job_type: BackgroundJobType;
    payload: unknown;
    status: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    max_attempts: number;
    run_after: string;
    last_error: string | null;
    claimed_at: string | null;
    claimed_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
    INSERT INTO background_jobs (
      id,
      job_type,
      payload,
      status,
      attempts,
      max_attempts,
      run_after,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3::jsonb, 'pending', 0, $4, COALESCE($5, NOW()), NOW(), NOW())
    RETURNING
      id::text,
      job_type,
      payload,
      status,
      attempts,
      max_attempts,
      run_after,
      last_error,
      claimed_at,
      claimed_by,
      completed_at,
      created_at,
      updated_at
    `,
    [
      id,
      params.jobType,
      JSON.stringify(params.payload),
      Math.max(1, params.maxAttempts || 3),
      params.runAfter || null,
    ],
  );

  return mapRow(result.rows[0]);
}

export async function claimNextBackgroundJob(workerId: string): Promise<BackgroundJobRecord | null> {
  const pool = getDbPool();

  const result = await pool.query<{
    id: string;
    job_type: BackgroundJobType;
    payload: unknown;
    status: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    max_attempts: number;
    run_after: string;
    last_error: string | null;
    claimed_at: string | null;
    claimed_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
    WITH candidate AS (
      SELECT id
      FROM background_jobs
      WHERE status = 'pending'
        AND run_after <= NOW()
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE background_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      claimed_at = NOW(),
      claimed_by = $1,
      updated_at = NOW()
    FROM candidate
    WHERE j.id = candidate.id
    RETURNING
      j.id::text,
      j.job_type,
      j.payload,
      j.status,
      j.attempts,
      j.max_attempts,
      j.run_after,
      j.last_error,
      j.claimed_at,
      j.claimed_by,
      j.completed_at,
      j.created_at,
      j.updated_at
    `,
    [workerId],
  );

  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markBackgroundJobCompleted(jobId: string): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE background_jobs
    SET
      status = 'completed',
      completed_at = NOW(),
      last_error = NULL,
      updated_at = NOW()
    WHERE id::text = $1
    `,
    [jobId],
  );
}

export async function markBackgroundJobFailed(params: {
  jobId: string;
  errorMessage: string;
  retryDelaySeconds?: number;
}): Promise<void> {
  const pool = getDbPool();
  const retryDelaySeconds = Math.max(0, params.retryDelaySeconds || 60);

  await pool.query(
    `
    UPDATE background_jobs
    SET
      status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      run_after = CASE
        WHEN attempts >= max_attempts THEN run_after
        ELSE NOW() + ($2::text || ' seconds')::interval
      END,
      last_error = LEFT($3, 4000),
      claimed_at = NULL,
      claimed_by = NULL,
      updated_at = NOW()
    WHERE id::text = $1
    `,
    [params.jobId, retryDelaySeconds, params.errorMessage],
  );
}

export async function listFailedBackgroundJobs(limit = 100): Promise<BackgroundJobRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const pool = getDbPool();

  const result = await pool.query<{
    id: string;
    job_type: BackgroundJobType;
    payload: unknown;
    status: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    max_attempts: number;
    run_after: string;
    last_error: string | null;
    claimed_at: string | null;
    claimed_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
    SELECT
      id::text,
      job_type,
      payload,
      status,
      attempts,
      max_attempts,
      run_after,
      last_error,
      claimed_at,
      claimed_by,
      completed_at,
      created_at,
      updated_at
    FROM background_jobs
    WHERE status = 'failed'
    ORDER BY updated_at DESC
    LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map(mapRow);
}

export async function retryFailedBackgroundJob(jobId: string): Promise<BackgroundJobRecord | null> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    job_type: BackgroundJobType;
    payload: unknown;
    status: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    max_attempts: number;
    run_after: string;
    last_error: string | null;
    claimed_at: string | null;
    claimed_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
    UPDATE background_jobs
    SET
      status = 'pending',
      attempts = 0,
      run_after = NOW(),
      last_error = NULL,
      claimed_at = NULL,
      claimed_by = NULL,
      completed_at = NULL,
      updated_at = NOW()
    WHERE id::text = $1
      AND status = 'failed'
    RETURNING
      id::text,
      job_type,
      payload,
      status,
      attempts,
      max_attempts,
      run_after,
      last_error,
      claimed_at,
      claimed_by,
      completed_at,
      created_at,
      updated_at
    `,
    [jobId],
  );

  const row = result.rows[0];
  return row ? mapRow(row) : null;
}
