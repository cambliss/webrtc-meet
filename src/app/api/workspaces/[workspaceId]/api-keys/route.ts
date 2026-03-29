import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
} from "@/src/lib/apiKeys";
import { canManageMembers, getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type WorkspaceRouteParams = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(_: Request, { params }: WorkspaceRouteParams) {
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

  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keys = await listWorkspaceApiKeys(workspaceId);
  return NextResponse.json({ apiKeys: keys });
}

export async function POST(req: Request, { params }: WorkspaceRouteParams) {
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

  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await req.json().catch(() => ({}))) as {
    name?: string;
    expiresAt?: string | null;
  };
  const name = payload.name?.trim() || "Developer API Key";
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;

  const result = await createWorkspaceApiKey({
    workspaceId,
    name,
    createdBy: auth.userId,
    expiresAt,
  });

  return NextResponse.json({
    created: true,
    apiKey: result.apiKey,
    keyPrefix: result.keyPrefix,
    note: "Store this key now; it cannot be shown again.",
  });
}

export async function DELETE(req: Request, { params }: WorkspaceRouteParams) {
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

  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { keyId?: string };
  const keyId = body.keyId?.trim();
  if (!keyId) {
    return NextResponse.json({ error: "keyId is required" }, { status: 400 });
  }

  const revoked = await revokeWorkspaceApiKey(workspaceId, keyId);
  if (!revoked) {
    return NextResponse.json({ error: "API key not found or already revoked" }, { status: 404 });
  }

  return NextResponse.json({ revoked: true, keyId });
}
