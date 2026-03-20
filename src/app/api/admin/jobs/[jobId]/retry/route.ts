import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSuperAdminAuth, verifyAuthToken } from "@/src/lib/auth";
import { retryFailedBackgroundJob } from "@/src/lib/repositories/backgroundJobRepository";

type RetryJobRouteParams = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_request: Request, { params }: RetryJobRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth || !isSuperAdminAuth(auth)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  const retried = await retryFailedBackgroundJob(jobId);

  if (!retried) {
    return NextResponse.json({ error: "Failed job not found" }, { status: 404 });
  }

  return NextResponse.json({
    retried: true,
    job: {
      id: retried.id,
      status: retried.status,
      attempts: retried.attempts,
      maxAttempts: retried.maxAttempts,
      runAfter: retried.runAfter,
      updatedAt: retried.updatedAt,
    },
  });
}
