import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  getNextApiServiceAudience,
  resolveScopedServiceWorkspaceId,
  verifyServiceTokenFromRequest,
} from "@/src/lib/serviceIdentity";
import { getDbPool } from "@/src/lib/db";
import { processMeetingEnd } from "@/src/lib/meetings/meetingEndProcessor";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";
import { enqueueBackgroundJob } from "@/src/lib/repositories/backgroundJobRepository";
import {
  abandonIdempotentRequest,
  completeIdempotentRequest,
  startIdempotentRequest,
} from "@/src/lib/repositories/idempotencyRepository";
import type { ChatMessage, MeetingFileShare, TranscriptLine } from "@/src/types/meeting";

type EndMeetingPayload = {
  roomId?: string;
  transcript?: string;
  transcriptLines?: TranscriptLine[];
  chatMessages?: ChatMessage[];
  fileShares?: MeetingFileShare[];
  recordingPath?: string | null;
};

export async function POST(request: Request) {
  const requestIp = getRequestIp(request);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  if (idempotencyKey.length > 200) {
    return NextResponse.json({ error: "Idempotency-Key is too long" }, { status: 400 });
  }

  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  let workspaceId = auth?.workspaceId || "";
  let actorUserId = auth?.userId || null;

  if (!workspaceId) {
    try {
      const serviceIdentity = verifyServiceTokenFromRequest({
        request,
        audience: getNextApiServiceAudience(),
        requiredScopes: ["meetings:write"],
      });

      workspaceId = resolveScopedServiceWorkspaceId({
        identity: serviceIdentity,
        headerWorkspaceId: request.headers.get("x-workspace-id"),
      });
      actorUserId = typeof serviceIdentity.claims.sub === "string" ? serviceIdentity.claims.sub : null;
    } catch {
      workspaceId = "";
    }
  }

  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as EndMeetingPayload;
  const roomId = payload.roomId?.trim() || "";
  const transcriptLines = Array.isArray(payload.transcriptLines) ? payload.transcriptLines : [];
  const chatMessages = Array.isArray(payload.chatMessages) ? payload.chatMessages : [];
  const fileShares = Array.isArray(payload.fileShares) ? payload.fileShares : [];
  const finalLines = transcriptLines
    .filter((line) => line.isFinal)
    .sort((a, b) => a.createdAt - b.createdAt);
  const transcriptFromLines = finalLines.map((line) => `${line.speakerName}: ${line.text}`).join("\n");
  const transcript = payload.transcript?.trim() || transcriptFromLines;
  const recordingPath = payload.recordingPath?.trim() || null;

  const idempotencyScope = "meeting-end";
  const idempotencyActor = buildRateLimitKey([workspaceId, actorUserId || requestIp]);
  const requestHash = createHash("sha256")
    .update(workspaceId)
    .update("|")
    .update(actorUserId || "anonymous")
    .update("|")
    .update(roomId)
    .update("|")
    .update(transcript)
    .update("|")
    .update(JSON.stringify(finalLines))
    .update("|")
    .update(JSON.stringify(chatMessages))
    .update("|")
    .update(JSON.stringify(fileShares))
    .update("|")
    .update(recordingPath || "")
    .digest("hex");

  if (idempotencyKey) {
    const started = await startIdempotentRequest({
      scope: idempotencyScope,
      actorKey: idempotencyActor,
      idempotencyKey,
      requestHash,
      ttlSeconds: Number(process.env.IDEMPOTENCY_TTL_SECONDS || "21600"),
    });

    if (started.state === "conflict") {
      return NextResponse.json(
        { error: "Idempotency-Key conflicts with a different request payload." },
        { status: 409 },
      );
    }

    if (started.state === "processing") {
      return NextResponse.json(
        { error: "Request with this Idempotency-Key is already processing." },
        { status: 409 },
      );
    }

    if (started.state === "replay") {
      return NextResponse.json(started.responseBody, { status: started.statusCode });
    }
  }

  const requestLimit = await checkRateLimit({
    scope: "meeting-end-requests",
    key: buildRateLimitKey([workspaceId, actorUserId || requestIp]),
    limit: Number(process.env.RATE_LIMIT_MEETING_END_PER_10_MIN || "40"),
    windowMs: 10 * 60 * 1000,
  });

  if (!requestLimit.allowed) {
    const response = NextResponse.json(
      { error: "Too many end-meeting requests. Please retry shortly." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(requestLimit.retryAfterSeconds));
    return response;
  }

  const textQuota = await checkRateLimit({
    scope: "meeting-end-text-quota",
    key: buildRateLimitKey([workspaceId]),
    limit: Number(process.env.RATE_LIMIT_MEETING_END_TEXT_CHARS_PER_10_MIN || "200000"),
    windowMs: 10 * 60 * 1000,
    weight: Math.max(1, transcript.length),
  });

  if (!textQuota.allowed) {
    const response = NextResponse.json(
      { error: "Meeting processing quota exceeded. Please retry shortly." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(textQuota.retryAfterSeconds));
    return response;
  }

  if (!roomId) {
    return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  }

  const pool = getDbPool();
  if (actorUserId) {
    const roleResult = await pool.query<{ role: "owner" | "admin" | "member" }>(
      `
      SELECT
        CASE
          WHEN w.owner_id = $2 THEN 'owner'
          ELSE wm.role
        END AS role
      FROM workspaces w
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = w.id
       AND wm.user_id = $2
      WHERE w.id = $1
        AND (w.owner_id = $2 OR wm.user_id = $2)
      LIMIT 1
      `,
      [workspaceId, actorUserId],
    );

    const workspaceRole = roleResult.rows[0]?.role;
    if (!workspaceRole) {
      return NextResponse.json({ error: "Workspace membership required" }, { status: 403 });
    }

    if (workspaceRole !== "owner" && workspaceRole !== "admin") {
      return NextResponse.json(
        { error: "Only workspace owner or admins can manage meetings" },
        { status: 403 },
      );
    }
  }

  const useBackgroundJobs =
    String(process.env.MEETING_END_USE_BACKGROUND_JOBS || "false").toLowerCase() === "true";

  if (useBackgroundJobs) {
    try {
      const job = await enqueueBackgroundJob({
        jobType: "meeting_end",
        payload: {
          workspaceId,
          actorUserId,
          roomId,
          transcript,
          transcriptLines: finalLines,
          chatMessages,
          fileShares,
          recordingPath,
        },
        maxAttempts: 4,
      });

      const responseBody = {
        roomId,
        queued: true,
        jobId: job.id,
        stored: false,
      };

      if (idempotencyKey) {
        await completeIdempotentRequest({
          scope: idempotencyScope,
          actorKey: idempotencyActor,
          idempotencyKey,
          requestHash,
          statusCode: 202,
          responseBody,
        });
      }

      return NextResponse.json(responseBody, { status: 202 });
    } catch (error) {
      if (idempotencyKey) {
        await abandonIdempotentRequest({
          scope: idempotencyScope,
          actorKey: idempotencyActor,
          idempotencyKey,
          requestHash,
        });
      }
      throw error;
    }
  }

  try {
    const processed = await processMeetingEnd({
      workspaceId,
      actorUserId,
      roomId,
      transcript,
      transcriptLines: finalLines,
      chatMessages,
      fileShares,
      recordingPath,
    });

    const responseBody = {
      roomId,
      meetingId: processed.meetingId,
      summary: processed.summary,
      extractedTasksCount: processed.extractedTasksCount,
      stored: true,
    };

    if (idempotencyKey) {
      await completeIdempotentRequest({
        scope: idempotencyScope,
        actorKey: idempotencyActor,
        idempotencyKey,
        requestHash,
        statusCode: 200,
        responseBody,
      });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    if (idempotencyKey) {
      await abandonIdempotentRequest({
        scope: idempotencyScope,
        actorKey: idempotencyActor,
        idempotencyKey,
        requestHash,
      });
    }

    throw error;
  }
}
