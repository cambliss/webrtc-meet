import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import { resolveWorkspaceByApiKey } from "@/src/lib/apiKeys";
import { verifyAuthToken } from "@/src/lib/auth";
import { getWorkspacePlan } from "@/src/lib/billing";
import { getDbPool } from "@/src/lib/db";
import { createMeetingInviteToken, ensureMeetingSecuritySchema } from "@/src/lib/meetingSecurity";

type WorkspaceRole = "owner" | "admin" | "member";

type MeetingMode = "instant" | "scheduled";

type MeetingsAuthContext = {
  workspaceId: string;
  userId: string | null;
  appRole: "host" | "participant" | null;
  workspaceRole: WorkspaceRole | null;
  viaApiKey: boolean;
};

async function resolveMeetingsAuthContext(req: Request): Promise<MeetingsAuthContext | null> {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (apiKey) {
    const resolved = await resolveWorkspaceByApiKey(apiKey);
    if (!resolved) {
      return null;
    }

    return {
      workspaceId: resolved.workspaceId,
      userId: null,
      appRole: null,
      workspaceRole: "owner",
      viaApiKey: true,
    };
  }

  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return null;
  }

  const pool = getDbPool();
  const roleResult = await pool.query<{ role: WorkspaceRole }>(
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
    [auth.workspaceId, auth.userId],
  );

  const workspaceRole = roleResult.rows[0]?.role;
  if (!workspaceRole) {
    return null;
  }

  return {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    appRole: auth.role,
    workspaceRole,
    viaApiKey: false,
  };
}

async function getWorkspaceOwnerUserId(workspaceId: string): Promise<string | null> {
  const pool = getDbPool();
  const result = await pool.query<{ owner_id: string }>(
    `
    SELECT owner_id
    FROM workspaces
    WHERE id = $1
    LIMIT 1
    `,
    [workspaceId],
  );

  return result.rows[0]?.owner_id || null;
}

export async function POST(req: Request) {
  await ensureMeetingSecuritySchema();
  const context = await resolveMeetingsAuthContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!context.viaApiKey && context.appRole !== "host") {
    return NextResponse.json({ error: "Only hosts can create meetings" }, { status: 403 });
  }

  const workspaceRole = context.workspaceRole;
  if (!workspaceRole) {
    return NextResponse.json({ error: "Workspace membership required" }, { status: 403 });
  }

  if (workspaceRole !== "owner" && workspaceRole !== "admin") {
    return NextResponse.json(
      { error: "Only workspace owner or admins can manage meetings" },
      { status: 403 },
    );
  }

  const plan = await getWorkspacePlan(context.workspaceId);
  const ownerId = await getWorkspaceOwnerUserId(context.workspaceId);
  const hostUserId = context.userId || ownerId;
  if (!hostUserId) {
    return NextResponse.json({ error: "Workspace owner not found" }, { status: 500 });
  }

  const payload = (await req.json().catch(() => ({}))) as {
    title?: string;
    mode?: MeetingMode;
    scheduledFor?: string;
  };

  const mode: MeetingMode = payload.mode === "scheduled" ? "scheduled" : "instant";

  const meetingId = uuidv4();
  const roomCode = `oc-${uuidv4().slice(0, 8)}`;
  const title = payload.title?.trim() || (mode === "scheduled" ? "Scheduled meeting" : "Instant meeting");
  const startedAt = mode === "instant" ? new Date() : null;
  const scheduledForDate = payload.scheduledFor ? new Date(payload.scheduledFor) : null;

  if (payload.scheduledFor && (!scheduledForDate || Number.isNaN(scheduledForDate.getTime()))) {
    return NextResponse.json({ error: "Invalid scheduled date/time" }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    await pool.query(
      `
      INSERT INTO meetings (id, workspace_id, host_id, title, status, room_id, host_user_id, started_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        meetingId,
        context.workspaceId,
        hostUserId,
        title,
        mode === "instant" ? "live" : "scheduled",
        roomCode,
        hostUserId,
        mode === "instant" ? startedAt : scheduledForDate,
      ],
    );
  } catch (error) {
    console.error("Failed to create meeting", error);
    return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://theofficeconnect.com";
  const ownerInvite = await createMeetingInviteToken({
    meetingId,
    workspaceId: context.workspaceId,
    inviterUserId: hostUserId,
    maxUses: null,
    expiresAt: null,
  });
  const joinLink = `${appUrl}/meeting/${roomCode}?invite=${encodeURIComponent(ownerInvite.inviteToken)}`;

  return NextResponse.json({
    meetingId,
    roomCode,
    joinCode: roomCode,
    joinLink,
    inviteToken: ownerInvite.inviteToken,
    mode,
    scheduledFor: mode === "scheduled" && scheduledForDate ? scheduledForDate.toISOString() : null,
    workspaceId: context.workspaceId,
    title,
    plan: {
      id: plan.id,
      name: plan.name,
      maxParticipants: plan.maxParticipants,
      maxMeetingMinutes: plan.maxMeetingMinutes,
      recordingEnabled: plan.recordingEnabled,
      aiEnabled: plan.aiEnabled,
    },
  });
}

export async function GET(req: Request) {
  await ensureMeetingSecuritySchema();
  const context = await resolveMeetingsAuthContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") || "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    title: string;
    status: string;
    room_id: string;
    created_at: string;
    started_at: string | null;
    ended_at: string | null;
  }>(
    `
    SELECT id, title, status, room_id, created_at, started_at, ended_at
    FROM meetings
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [context.workspaceId, limit],
  );

  return NextResponse.json({
    meetings: result.rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    })),
  });
}

export async function DELETE(req: Request) {
  await ensureMeetingSecuritySchema();
  const context = await resolveMeetingsAuthContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (context.workspaceRole !== "owner" && context.workspaceRole !== "admin") {
    return NextResponse.json(
      { error: "Only workspace owner or admins can delete meetings" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { meetingId?: string };
  const meetingId = (body.meetingId || url.searchParams.get("meetingId") || "").trim();
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  const pool = getDbPool();
  const result = await pool.query(
    `
    DELETE FROM meetings
    WHERE workspace_id = $1
      AND (id::text = $2 OR room_id = $2)
    `,
    [context.workspaceId, meetingId],
  );

  if ((result.rowCount || 0) === 0) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, meetingId });
}
