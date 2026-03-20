import { getDbPool } from "@/src/lib/db";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceAccess = {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  role: WorkspaceRole;
};

export async function getWorkspaceAccess(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceAccess | null> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    name: string;
    owner_id: string;
    role: WorkspaceRole;
  }>(
    `
    SELECT
      w.id,
      w.name,
      w.owner_id,
      CASE
        WHEN w.owner_id = $2 THEN 'owner'
        ELSE wm.role
      END AS role
    FROM workspaces w
    LEFT JOIN workspace_members wm
      ON wm.workspace_id = w.id
     AND wm.user_id = $2
    WHERE w.id = $1
      AND (w.owner_id = $2 OR wm.user_id = $2)
    LIMIT 1
    `,
    [workspaceId, userId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    workspaceId: row.id,
    workspaceName: row.name,
    ownerId: row.owner_id,
    role: row.role,
  };
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageMeetings(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === "owner";
}
