import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSuperAdminAuth, verifyAuthToken } from "@/src/lib/auth";
import { listFailedBackgroundJobs } from "@/src/lib/repositories/backgroundJobRepository";

export async function GET(request: Request) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth || !isSuperAdminAuth(auth)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "100");
  const failedJobs = await listFailedBackgroundJobs(limit);

  return NextResponse.json({
    jobs: failedJobs.map((job) => ({
      id: job.id,
      jobType: job.jobType,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      payload: job.payload,
    })),
  });
}
