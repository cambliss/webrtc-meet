import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { canManageMembers, getWorkspaceAccess, type WorkspaceRole } from "@/src/lib/workspaceRbac";

type MemberRouteParams = {
  params: Promise<{ workspaceId: string; userId: string }>;
};

export async function PATCH(req: Request, { params }: MemberRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, userId } = await params;
  const access = await getWorkspaceAccess(workspaceId, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (!canManageMembers(access.role)) {
    return NextResponse.json(
      { error: "Only workspace owner or admins can change member roles" },
      { status: 403 },
    );
  }

  const payload = (await req.json().catch(() => ({}))) as { role?: WorkspaceRole };
  const nextRole = payload.role;

  if (nextRole !== "admin" && nextRole !== "member") {
    return NextResponse.json({ error: "Role must be admin or member" }, { status: 400 });
  }

  if (userId === access.ownerId) {
    return NextResponse.json({ error: "Owner role cannot be changed" }, { status: 400 });
  }

  const pool = getDbPool();
  const existing = await pool.query<{ user_id: string }>(
    `
    SELECT user_id
    FROM workspace_members
    WHERE workspace_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [workspaceId, userId],
  );

  if (!existing.rows[0]) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await pool.query(
    `
    UPDATE workspace_members
    SET role = $3
    WHERE workspace_id = $1 AND user_id = $2
    `,
    [workspaceId, userId, nextRole],
  );

  return NextResponse.json({ updated: true, userId, role: nextRole });
}

export async function DELETE(_: Request, { params }: MemberRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, userId } = await params;
  const access = await getWorkspaceAccess(workspaceId, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (!canManageMembers(access.role)) {
    return NextResponse.json(
      { error: "Only workspace owner or admins can remove members" },
      { status: 403 },
    );
  }

  if (userId === access.ownerId) {
    return NextResponse.json({ error: "Workspace owner cannot be removed" }, { status: 400 });
  }

  const pool = getDbPool();
  const result = await pool.query(
    `
    DELETE FROM workspace_members
    WHERE workspace_id = $1 AND user_id = $2
    `,
    [workspaceId, userId],
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({ removed: true, userId });
}
