import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSuperAdminAuth, verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { logError, processStats } from "@/src/lib/observability";
import { shouldUseS3ObjectStorage } from "@/src/lib/objectStorage";

type CountByStatus = {
  status: string;
  count: string;
};

type ScalarNumber = {
  value: string | number | null;
};

function numberFromUnknown(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth || !isSuperAdminAuth(auth)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = getDbPool();

  try {
    const [jobCountsResult, oldestPendingResult, secureFilesResult, meetingsResult, dbPing] = await Promise.all([
      pool.query<CountByStatus>(
        `
        SELECT status, COUNT(*)::text AS count
        FROM background_jobs
        GROUP BY status
        `,
      ),
      pool.query<ScalarNumber>(
        `
        SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::text AS value
        FROM background_jobs
        WHERE status = 'pending'
        `,
      ),
      pool.query<ScalarNumber>(
        `
        SELECT COALESCE(SUM(file_size), 0)::text AS value
        FROM workspace_secure_files
        `,
      ),
      pool.query<ScalarNumber>(
        `
        SELECT COUNT(*)::text AS value
        FROM meetings
        WHERE status = 'ended'
        `,
      ),
      pool.query("SELECT 1"),
    ]);

    const queue = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      oldestPendingAgeSeconds: numberFromUnknown(oldestPendingResult.rows[0]?.value),
    };

    for (const row of jobCountsResult.rows) {
      const count = numberFromUnknown(row.count);
      if (row.status === "pending") queue.pending = count;
      if (row.status === "processing") queue.processing = count;
      if (row.status === "completed") queue.completed = count;
      if (row.status === "failed") queue.failed = count;
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      db: {
        healthy: (dbPing.rowCount || 0) > 0,
      },
      app: processStats(),
      queue,
      storage: {
        provider: shouldUseS3ObjectStorage() ? "s3" : "local",
        secureFilesTotalBytes: numberFromUnknown(secureFilesResult.rows[0]?.value),
      },
      meetings: {
        endedCount: numberFromUnknown(meetingsResult.rows[0]?.value),
      },
    });
  } catch (error) {
    logError("admin.metrics.failed", {
      userId: auth.userId,
      username: auth.username,
      error,
    });

    return NextResponse.json({ error: "Metrics unavailable" }, { status: 503 });
  }
}
