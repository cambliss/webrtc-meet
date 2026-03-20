import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSuperAdminAuth, verifyAuthToken } from "@/src/lib/auth";
import { ensureMeetingSecuritySchema, listSecurityEvents } from "@/src/lib/meetingSecurity";

async function resolveAuth() {
  const token = (await cookies()).get("meeting_token")?.value;
  return token ? verifyAuthToken(token) : null;
}

export async function GET(req: Request) {
  await ensureMeetingSecuritySchema();

  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSuperAdmin = isSuperAdminAuth(auth);

  if (!isSuperAdmin && auth.role !== "host") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "200");

  const rows = await listSecurityEvents({
    workspaceId: isSuperAdmin ? undefined : auth.workspaceId,
    limit: Number.isFinite(limit) ? limit : 200,
  });

  return NextResponse.json({ events: rows, isSuperAdmin });
}
