import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { sendWorkspaceInviteEmail } from "@/src/lib/email";
import { canManageMembers, getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type InviteRouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: InviteRouteParams) {
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
    return NextResponse.json(
      { error: "Only workspace owner or admins can invite members" },
      { status: 403 },
    );
  }

  const payload = (await req.json().catch(() => ({}))) as {
    email?: string;
    role?: "admin" | "member";
  };

  const email = payload.email?.trim().toLowerCase();
  const inviteRole = payload.role ?? "member";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (inviteRole !== "admin" && inviteRole !== "member") {
    return NextResponse.json({ error: "Role must be admin or member" }, { status: 400 });
  }

  const inviteToken = randomUUID();
  const baseAppUrl =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.CLIENT_ORIGIN || "http://localhost:3000";
  const inviteLink = `${baseAppUrl}/signup?invite=${encodeURIComponent(inviteToken)}`;

  const pool = getDbPool();
  await pool.query(
    `
    INSERT INTO workspace_invites (token, workspace_id, email, role, invited_by, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
    `,
    [inviteToken, id, email, inviteRole, auth.userId],
  );

  const emailResult = await sendWorkspaceInviteEmail({
    toEmail: email,
    workspaceName: access.workspaceName,
    inviterName: auth.username,
    inviteLink,
  });

  return NextResponse.json({
    invite: {
      token: inviteToken,
      workspaceId: id,
      email,
      role: inviteRole,
      inviteLink,
      expiresInDays: 7,
      emailDelivery: emailResult,
    },
  });
}
