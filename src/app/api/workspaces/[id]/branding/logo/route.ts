import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { canManageMembers, getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type WorkspaceRouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: WorkspaceRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getWorkspaceAccess(id, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Max logo size is 2MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1] || "png";
  const fileName = `${randomUUID()}.${ext}`;

  const absoluteDir = path.join(process.cwd(), "public", "uploads", "workspaces", id);
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, fileName), bytes);

  const logoUrl = `/uploads/workspaces/${id}/${fileName}`;

  const pool = getDbPool();
  await pool.query(`UPDATE workspaces SET logo_url = $2 WHERE id = $1`, [id, logoUrl]);

  return NextResponse.json({ uploaded: true, logoUrl });
}
