import { promises as fs } from "node:fs";
import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";

type MeetingFileDownloadRouteParams = {
  params: Promise<{
    meetingId: string;
    fileId: string;
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

function contentTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();

  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

export async function GET(request: Request, { params }: MeetingFileDownloadRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  const resolvedParams = await params;
  const fileId = sanitizeSegment(resolvedParams.fileId);
  if (!fileId) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const workspaceScopedRoomId = auth
    ? await resolveRoomIdForWorkspace(auth.workspaceId, resolvedParams.meetingId)
    : null;
  const roomId = workspaceScopedRoomId || (await resolveRoomId(resolvedParams.meetingId));
  if (!roomId) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const recordingsRoot = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || "recordings");
  const roomDir = path.join(recordingsRoot, "shared-files", sanitizeSegment(roomId));

  try {
    const items = await fs.readdir(roomDir);
    const matchedName = items.find((name) => name.startsWith(`${fileId}-`));
    if (!matchedName) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const filePath = path.join(roomDir, matchedName);
    const fileBuffer = await fs.readFile(filePath);
    const originalName = matchedName.split("-").slice(1).join("-") || matchedName;
    const contentType = contentTypeFromFileName(originalName);
    const { searchParams } = new URL(request.url);
    const asDownload = searchParams.get("download") === "1";
    const dispositionType = asDownload ? "attachment" : "inline";

    const body = new Blob([new Uint8Array(fileBuffer)]);

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionType}; filename="${originalName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
