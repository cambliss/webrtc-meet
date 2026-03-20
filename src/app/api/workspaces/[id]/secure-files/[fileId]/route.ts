import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  deleteSecureSharedFile,
  resolveSecureSharedFileDownload,
} from "@/src/lib/objectStorage";
import {
  deleteWorkspaceSecureFileById,
  getWorkspaceSecureFileById,
} from "@/src/lib/repositories/secureFileRepository";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type SecureFileDownloadRouteParams = {
  params: Promise<{ id: string; fileId: string }>;
};

export async function GET(request: Request, { params }: SecureFileDownloadRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, fileId } = await params;
  const access = await getWorkspaceAccess(id, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const file = await getWorkspaceSecureFileById(access.workspaceId, fileId);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const asDownload = searchParams.get("download") !== "0";
    const download = await resolveSecureSharedFileDownload({
      workspaceId: access.workspaceId,
      storageName: file.storageName,
      originalName: file.originalName,
      mimeType: file.mimeType,
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
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: SecureFileDownloadRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, fileId } = await params;
  const access = await getWorkspaceAccess(id, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const file = await getWorkspaceSecureFileById(access.workspaceId, fileId);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const canDelete =
    file.uploaderUserId === auth.userId || access.role === "owner" || access.role === "admin";

  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const removed = await deleteWorkspaceSecureFileById({
    workspaceId: access.workspaceId,
    fileId: file.id,
  });

  if (!removed) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await deleteSecureSharedFile({
    workspaceId: access.workspaceId,
    storageName: file.storageName,
  }).catch(() => {
    // Metadata delete is source-of-truth; missing object/file is treated as already removed.
  });

  return NextResponse.json({ deleted: true, fileId: file.id });
}
