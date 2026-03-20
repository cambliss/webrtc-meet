import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import {
  canDeleteWorkspace,
  canManageMembers,
  getWorkspaceAccess,
} from "@/src/lib/workspaceRbac";

type WorkspaceRouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: WorkspaceRouteParams) {
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

  const pool = getDbPool();
  const workspaceResult = await pool.query<{
    brand_name: string | null;
    logo_url: string | null;
    custom_domain: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  }>(
    `
    SELECT brand_name, logo_url, custom_domain, primary_color, secondary_color
    FROM workspaces
    WHERE id = $1
    LIMIT 1
    `,
    [id],
  );
  const workspace = workspaceResult.rows[0];

  return NextResponse.json({
    workspace: {
      id: access.workspaceId,
      name: access.workspaceName,
      ownerId: access.ownerId,
      role: access.role,
      brandName: workspace?.brand_name || access.workspaceName,
      logoUrl: workspace?.logo_url || null,
      customDomain: workspace?.custom_domain || null,
      primaryColor: workspace?.primary_color || null,
      secondaryColor: workspace?.secondary_color || null,
      permissions: {
        canManageMembers: canManageMembers(access.role),
        canManageMeetings: canManageMembers(access.role),
        canDeleteWorkspace: canDeleteWorkspace(access.role),
      },
    },
  });
}

export async function PATCH(req: Request, { params }: WorkspaceRouteParams) {
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
      { error: "Only workspace owner or admins can update workspace settings" },
      { status: 403 },
    );
  }

  const payload = (await req.json().catch(() => ({}))) as {
    name?: string;
    brandName?: string;
    logoUrl?: string | null;
    customDomain?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  };
  const nextName = payload.name?.trim();
  const nextBrandName = payload.brandName?.trim() || null;
  const nextLogoUrl = payload.logoUrl?.trim() || null;
  const nextCustomDomain = payload.customDomain?.trim() || null;
  const nextPrimaryColor = payload.primaryColor?.trim() || null;
  const nextSecondaryColor = payload.secondaryColor?.trim() || null;

  if (!nextName) {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }

  const pool = getDbPool();
  await pool.query(
    `
    UPDATE workspaces
    SET
      name = $2,
      brand_name = $3,
      logo_url = $4,
      custom_domain = $5,
      primary_color = $6,
      secondary_color = $7
    WHERE id = $1
    `,
    [
      id,
      nextName,
      nextBrandName,
      nextLogoUrl,
      nextCustomDomain,
      nextPrimaryColor,
      nextSecondaryColor,
    ],
  );

  return NextResponse.json({
    workspace: {
      id,
      name: nextName,
      brandName: nextBrandName,
      logoUrl: nextLogoUrl,
      customDomain: nextCustomDomain,
      primaryColor: nextPrimaryColor,
      secondaryColor: nextSecondaryColor,
    },
  });
}

export async function DELETE(_: Request, { params }: WorkspaceRouteParams) {
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

  if (!canDeleteWorkspace(access.role)) {
    return NextResponse.json(
      { error: "Only workspace owner can delete this workspace" },
      { status: 403 },
    );
  }

  const pool = getDbPool();
  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [id]);

  return NextResponse.json({ deleted: true, workspaceId: id });
}
