import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { cookies } from "next/headers";

// Allow large file uploads (no built-in body size cap)
export const maxDuration = 120;
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import type { MeetingFileShare } from "@/src/types/meeting";

type MeetingFilesRouteParams = {
  params: Promise<{
    meetingId: string;
  }>;
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function resolveRoomIdForWorkspace(workspaceId: string, meetingIdOrRoomId: string) {
  const pool = getDbPool();
  const result = await pool.query<{ room_id: string }>(
    `
    SELECT room_id
    FROM meetings
    WHERE workspace_id = $1
      AND (id::text = $2 OR room_id = $2)
    LIMIT 1
    `,
    [workspaceId, meetingIdOrRoomId],
  );

  return result.rows[0]?.room_id || null;
}

async function resolveRoomId(meetingIdOrRoomId: string) {
  const pool = getDbPool();
  const result = await pool.query<{ room_id: string }>(
    `
    SELECT room_id
    FROM meetings
    WHERE id::text = $1 OR room_id = $1
    LIMIT 1
    `,
    [meetingIdOrRoomId],
  );

  return result.rows[0]?.room_id || null;
}

function normalizeSenderName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    return trimmed.slice(0, 40);
  }

  return "Guest";
}

function resolveMaxSharedFileSizeBytes(): number {
  const maxMb = Number(
    process.env.MAX_SHARED_FILE_SIZE_MB || process.env.NEXT_PUBLIC_MAX_SHARED_FILE_SIZE_MB || "100",
  );

  if (!Number.isFinite(maxMb) || maxMb <= 0) {
    return 100 * 1024 * 1024;
  }

  return Math.floor(maxMb * 1024 * 1024);
}

export async function POST(request: Request, { params }: MeetingFilesRouteParams) {
  try {
    const token = (await cookies()).get("meeting_token")?.value;
    const auth = token ? verifyAuthToken(token) : null;

    const resolvedParams = await params;
    const meetingIdOrRoomId = resolvedParams.meetingId;
    const workspaceScopedRoomId = auth ? await resolveRoomIdForWorkspace(auth.workspaceId, meetingIdOrRoomId) : null;
    const roomId = workspaceScopedRoomId || (await resolveRoomId(meetingIdOrRoomId));

    if (!roomId) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const maxBytes = resolveMaxSharedFileSizeBytes();
    if (file.size > maxBytes) {
      const maxMb = Math.floor(maxBytes / (1024 * 1024));
      return NextResponse.json({ error: `Max file size is ${maxMb}MB` }, { status: 400 });
    }

    const senderNameField = form.get("senderName");
    const senderIdField = form.get("senderId");
    const senderName = auth
      ? auth.username
      : normalizeSenderName(typeof senderNameField === "string" ? senderNameField : "");
    const senderId = auth
      ? auth.userId
      : (() => {
          const candidate = typeof senderIdField === "string" ? senderIdField.trim() : "";
          return candidate.length > 0 ? candidate.slice(0, 80) : `guest-${fileIdPart()}`;
        })();

    const recordingsRoot = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || "recordings");
    const roomDir = path.join(recordingsRoot, "shared-files", sanitizeSegment(roomId));
    await fs.mkdir(roomDir, { recursive: true });

    const fileId = randomUUID();
    const safeName = sanitizeSegment(path.basename(file.name, path.extname(file.name))) || "shared-file";
    const ext = path.extname(file.name || "").toLowerCase() || ".bin";
    const storageName = `${fileId}-${safeName}${ext}`;
    const fullPath = path.join(roomDir, storageName);

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(fullPath, Buffer.from(arrayBuffer));

    const fileShare: MeetingFileShare = {
      id: fileId,
      senderId,
      senderName,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      sharedAt: Date.now(),
    };

    return NextResponse.json({ uploaded: true, file: fileShare });
  } catch (error) {
    console.error("Meeting file upload failed:", error);
    const message = error instanceof Error ? error.message : "Unable to upload file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function fileIdPart() {
  return randomUUID().slice(0, 12);
}
