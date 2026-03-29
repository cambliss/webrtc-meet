import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import {
  resolveMeetingRecordingDownload,
  uploadMeetingRecording,
} from "@/src/lib/objectStorage";
import {
  addRecordingWatermarkMetadata,
  generateRecordingWatermarkText,
} from "@/src/lib/recordingWatermark";
import { getRecordingPathByMeetingId } from "@/src/lib/repositories/meetingSummaryRepository";

type RecordingRouteParams = {
  params: Promise<{
    meetingId: string;
  }>;
};

export async function POST(request: Request, { params }: RecordingRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await params;
  const meetingId = resolvedParams.meetingId;
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Recording file is required" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Recording file is empty" }, { status: 400 });
  }

  const safeMeetingId = meetingId.replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = path.extname(file.name || "").toLowerCase() || ".webm";
  const fileName = `meeting-${safeMeetingId}-${Date.now()}${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const storedPath = await uploadMeetingRecording({
    storageName: fileName,
    bytes: Buffer.from(arrayBuffer),
    mimeType: file.type || "video/webm",
  });

  // Retrieve meeting metadata for watermark and backfill the meeting row.
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `
      SELECT id, room_id, workspace_id, host_id
      FROM meetings
      WHERE id = $1 OR room_id = $1
      ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
      LIMIT 1
      `,
      [meetingId],
    );

    const meeting = result.rows[0];
    if (meeting) {
      await pool.query(
        `
        UPDATE meetings
        SET recording_path = $2,
            ended_at = COALESCE(ended_at, NOW())
        WHERE id = $1
        `,
        [meeting.id, storedPath],
      );

      const watermarkText = generateRecordingWatermarkText({
        roomId: meeting.room_id,
        hostUsername: auth.username,
        customTemplate: process.env.RECORDING_WATERMARK_TEXT,
      });

      // Add watermark metadata for audit trail & compliance
      await addRecordingWatermarkMetadata({
        recordingPath: storedPath,
        meetingId: meeting.id,
        roomId: meeting.room_id,
        workspaceId: meeting.workspace_id,
        hostUserId: meeting.host_id,
        watermarkText,
        audioWatermarkEnabled: false,
        metadata: {
          uploadedByUserId: auth.userId,
          uploadedByUsername: auth.username,
          uploadedAt: new Date().toISOString(),
          contentType: file.type || "video/webm",
          fileSize: file.size,
        },
      });
    }
  } catch (error) {
    console.error("Failed to add watermark metadata:", error);
    // Continue anyway - don't fail recording upload if metadata insert fails
  }

  return NextResponse.json({ uploaded: true, filePath: storedPath });
}

export async function GET(_: Request, { params }: RecordingRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await params;
  const meetingId = resolvedParams.meetingId;
  const storedPath = await getRecordingPathByMeetingId(auth.workspaceId, meetingId);

  if (!storedPath) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(_.url);
    const asDownload = searchParams.get("download") === "1";
    const download = await resolveMeetingRecordingDownload({
      storedPath,
      asDownload,
    });

    if (download.kind === "redirect") {
      return NextResponse.redirect(download.url, { status: 302 });
    }

    const body = new Blob([new Uint8Array(download.bytes)]);

    return new NextResponse(body, {
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": download.contentDisposition,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Recording file is unavailable" }, { status: 404 });
  }
}
