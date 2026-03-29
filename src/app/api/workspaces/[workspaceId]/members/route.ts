import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { canManageMembers, getWorkspaceAccess, type WorkspaceRole } from "@/src/lib/workspaceRbac";

type MembersRouteParams = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(_: Request, { params }: MembersRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;
  const access = await getWorkspaceAccess(workspaceId, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const pool = getDbPool();
  const result = await pool.query<{
    user_id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    joined_at: string;
  }>(
    `
    SELECT
      wm.user_id,
      u.name,
      u.email,
      CASE
        WHEN w.owner_id = wm.user_id THEN 'owner'
        ELSE wm.role
      END AS role,
      wm.joined_at
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = $1
    ORDER BY wm.joined_at ASC
    `,
    [workspaceId],
  );

  return NextResponse.json({
    workspaceId,
    currentRole: access.role,
    canManageMembers: canManageMembers(access.role),
    members: result.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      joinedAt: row.joined_at,
    })),
  });
}
