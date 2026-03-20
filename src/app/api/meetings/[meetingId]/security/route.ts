import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  createSecurityBlock,
  createSecurityEvent,
  ensureMeetingSecuritySchema,
  resolveMeetingByIdOrRoomId,
  setMeetingLock,
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

  if (auth.role !== "host") {
    return NextResponse.json({ error: "Only hosts can apply security controls" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "block_device" | "block_ip" | "lock" | "unlock";
    deviceFingerprint?: string;
    ipAddress?: string;
    reason?: string;
  };

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  if (action === "lock" || action === "unlock") {
    await setMeetingLock({
      meetingId: meeting.meetingId,
      locked: action === "lock",
      actorUserId: auth.userId,
    });

    await createSecurityEvent({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.meetingId,
      eventType: action === "lock" ? "meeting_locked" : "meeting_unlocked",
      severity: "info",
      actorUserId: auth.userId,
      metadata: { roomId: meeting.roomId },
    });

    return NextResponse.json({ updated: true, meetingLocked: action === "lock" });
  }

  if (action === "block_device") {
    const value = body.deviceFingerprint?.trim();
    if (!value) {
      return NextResponse.json({ error: "deviceFingerprint is required" }, { status: 400 });
    }

    await createSecurityBlock({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.meetingId,
      blockType: "device",
      blockValue: value,
      reason: body.reason || "Blocked by host",
      actorUserId: auth.userId,
    });

    await createSecurityEvent({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.meetingId,
      eventType: "device_blocked",
      severity: "warning",
      actorUserId: auth.userId,
      deviceFingerprint: value,
      metadata: { reason: body.reason || "Blocked by host" },
    });

    return NextResponse.json({ blocked: true, blockType: "device", value });
  }

  if (action === "block_ip") {
    const value = body.ipAddress?.trim();
    if (!value) {
      return NextResponse.json({ error: "ipAddress is required" }, { status: 400 });
    }

    await createSecurityBlock({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.meetingId,
      blockType: "ip",
      blockValue: value,
      reason: body.reason || "Blocked by host",
      actorUserId: auth.userId,
    });

    await createSecurityEvent({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.meetingId,
      eventType: "ip_blocked",
      severity: "warning",
      actorUserId: auth.userId,
      ipAddress: value,
      metadata: { reason: body.reason || "Blocked by host" },
    });

    return NextResponse.json({ blocked: true, blockType: "ip", value });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
