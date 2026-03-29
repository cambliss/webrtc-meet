import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getWorkspacePaymentHistory } from "@/src/lib/billing";
import { getDbPool } from "@/src/lib/db";

async function assertWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query<{ can_access: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM workspaces w
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = w.id
       AND wm.user_id = $2
      WHERE w.id = $1
        AND (w.owner_id = $2 OR wm.user_id = $2)
    ) AS can_access
    `,
    [workspaceId, userId],
  );
  return Boolean(result.rows[0]?.can_access);
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("meeting_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = verifyAuthToken(token);
  if (!auth || !auth.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await assertWorkspaceMember(auth.workspaceId, auth.userId);
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const history = await getWorkspacePaymentHistory(auth.workspaceId, 50);
  return NextResponse.json({ history });
}
