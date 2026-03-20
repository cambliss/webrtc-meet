import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  createMeetingInviteToken,
  ensureMeetingSecuritySchema,
  resolveInviteToken,
  resolveMeetingByIdOrRoomId,
} from "@/src/lib/meetingSecurity";

type MeetingRouteParams = {
  params: Promise<{
    meetingId: string;
  }>;
};

async function resolveAuth() {
  const token = (await cookies()).get("meeting_token")?.value;
  return token ? verifyAuthToken(token) : null;
}

export async function POST(req: Request, { params }: MeetingRouteParams) {
  await ensureMeetingSecuritySchema();

  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const meeting = await resolveMeetingByIdOrRoomId(meetingId);
  if (!meeting || meeting.workspaceId !== auth.workspaceId) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    parentInviteToken?: string;
    maxUses?: number;
    expiresInMinutes?: number;
  };

  let parentTokenId: string | null = null;
  if (body.parentInviteToken?.trim()) {
    const parent = await resolveInviteToken({
      meetingId: meeting.meetingId,
      inviteToken: body.parentInviteToken.trim(),
    });
    parentTokenId = parent?.id || null;
  }

  const expiresInMinutes = Number(body.expiresInMinutes || 0);
  const expiresAt =
    Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
      : null;

  const created = await createMeetingInviteToken({
    meetingId: meeting.meetingId,
    workspaceId: meeting.workspaceId,
    inviterUserId: auth.userId,
    parentTokenId,
    maxUses:
      Number.isFinite(Number(body.maxUses)) && Number(body.maxUses) > 0
        ? Number(body.maxUses)
        : null,
    expiresAt,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const joinLink = `${appUrl}/meeting/${meeting.roomId}?invite=${encodeURIComponent(created.inviteToken)}`;

  return NextResponse.json({
    created: true,
    inviteToken: created.inviteToken,
    joinLink,
    meetingId: meeting.meetingId,
    roomId: meeting.roomId,
  });
}
