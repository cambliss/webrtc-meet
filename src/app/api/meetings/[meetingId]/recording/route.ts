import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  resolveMeetingRecordingDownload,
  uploadMeetingRecording,
} from "@/src/lib/objectStorage";
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
