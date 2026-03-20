import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSuperAdminAuth, verifyAuthToken } from "@/src/lib/auth";

export async function GET() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: auth.userId,
      username: auth.username,
      role: auth.role,
      workspaceId: auth.workspaceId,
      isSuperAdmin: isSuperAdminAuth(auth),
    },
  });
}
