import { hostname } from "node:os";
import process from "node:process";

import {
  claimNextBackgroundJob,
  markBackgroundJobCompleted,
  markBackgroundJobFailed,
} from "@/src/lib/repositories/backgroundJobRepository";
import {
  processMeetingEnd,
  type MeetingEndProcessInput,
} from "@/src/lib/meetings/meetingEndProcessor";
import { logError, logInfo } from "@/src/lib/observability";

type WorkerJobPayload = MeetingEndProcessInput;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isMeetingEndPayload(value: unknown): value is WorkerJobPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<WorkerJobPayload>;
  return (
    typeof payload.workspaceId === "string" &&
    typeof payload.roomId === "string" &&
    typeof payload.transcript === "string" &&
    Array.isArray(payload.transcriptLines) &&
    Array.isArray(payload.chatMessages) &&
    Array.isArray(payload.fileShares)
  );
}

async function processOne(workerId: string): Promise<boolean> {
  const job = await claimNextBackgroundJob(workerId);
  if (!job) {
    return false;
  }

  try {
    if (job.jobType === "meeting_end") {
      if (!isMeetingEndPayload(job.payload)) {
        throw new Error("Invalid meeting_end payload");
      }

      await processMeetingEnd(job.payload);
    } else {
      throw new Error(`Unsupported job type: ${job.jobType}`);
    }

    await markBackgroundJobCompleted(job.id);
    logInfo("jobs.completed", {
      jobId: job.id,
      jobType: job.jobType,
      attempts: job.attempts,
      workerId,
    });
    return true;
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    await markBackgroundJobFailed({
      jobId: job.id,
      errorMessage,
      retryDelaySeconds: 30,
    });
    logError("jobs.failed", {
      jobId: job.id,
      jobType: job.jobType,
      attempts: job.attempts,
      workerId,
      error: errorMessage,
    });
    return true;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pollMs = Math.max(250, Number(process.env.BACKGROUND_JOB_POLL_MS || "1500"));
  const workerId = process.env.BACKGROUND_WORKER_ID || `${hostname()}-${process.pid}`;

  logInfo("jobs.worker.started", {
    workerId,
    pollMs,
  });

  while (true) {
    const didWork = await processOne(workerId);
    if (!didWork) {
      await sleep(pollMs);
    }
  }
}

main().catch((error) => {
  logError("jobs.worker.crashed", {
    error: toErrorMessage(error),
  });
  process.exit(1);
});
