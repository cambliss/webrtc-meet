import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { revokeSession, touchSession } from "@/src/lib/sessions";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * DELETE /api/auth/sessions/[sessionId]
 * Revokes a specific session. Users can only revoke their own sessions.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { sessionId } = await params;
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  // Determine revoke reason: if revoking their own current session it's "logout",
  // otherwise it's a remote logout from another device.
  const reason = sessionId === auth.sessionId ? "logout" : "remote_logout";

  const revoked = await revokeSession(sessionId, auth.userId, reason);

  if (!revoked) {
    return NextResponse.json({ error: "Session not found or already revoked" }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}

/**
 * PATCH /api/auth/sessions/[sessionId]
 * Updates last_active_at for the given session (called periodically by client).
 */
export async function PATCH(_req: Request, { params }: Params) {
  const { sessionId } = await params;
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth || auth.sessionId !== sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await touchSession(sessionId);
  return NextResponse.json({ ok: true });
}
