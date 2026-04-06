import { cookies } from "next/headers";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type WorkspaceUsersRouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(
  _request: Request,
  { params }: WorkspaceUsersRouteContext,
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("meeting_token")?.value;
    const auth = token ? verifyAuthToken(token) : null;

    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { workspaceId: rawWorkspaceId } = await params;
    const workspaceId = decodeURIComponent(rawWorkspaceId);
    const access = await getWorkspaceAccess(workspaceId, auth.userId);

    if (!access) {
      return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pool = getDbPool();
    const result = await pool.query<{
      id: string;
      name: string;
      email: string;
      display_name: string | null;
      avatar_path: string | null;
      created_at: string | null;
    }>(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.display_name,
          u.avatar_path,
          u.created_at::text
        FROM users u
        INNER JOIN (
          SELECT w.owner_id AS user_id
          FROM workspaces w
          WHERE w.id = $1
          UNION
          SELECT wm.user_id
          FROM workspace_members wm
          WHERE wm.workspace_id = $1
        ) workspace_users
          ON workspace_users.user_id = u.id
        WHERE u.id != $2
        ORDER BY COALESCE(u.display_name, u.name, u.email) ASC
      `,
      [workspaceId, auth.userId]
    );

    const users = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      displayName: row.display_name,
      avatarPath: row.avatar_path,
      createdAt: row.created_at,
    }));

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching workspace users:", error);
    return new Response(
      JSON.stringify({ error: "Unable to fetch users" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
