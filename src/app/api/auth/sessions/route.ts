import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  listActiveSessions,
  listLoginHistory,
  listLoginAttempts,
  revokeAllSessions,
  touchSession,
} from "@/src/lib/sessions";

/**
 * GET /api/auth/sessions
 * Returns the calling user's active sessions, login history, and login attempts.
 */
export async function GET() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Refresh last-active timestamp for the current session.
  if (auth.sessionId) {
    void touchSession(auth.sessionId);
  }

  const [activeSessions, loginHistory, loginAttempts] = await Promise.all([
    listActiveSessions(auth.userId),
    listLoginHistory(auth.userId, 30),
    listLoginAttempts(auth.userId, 30),
  ]);

  return NextResponse.json({
    currentSessionId: auth.sessionId ?? null,
    activeSessions,
    loginHistory,
    loginAttempts,
  });
}

/**
 * DELETE /api/auth/sessions
 * Revokes all sessions except the current one ("logout all other devices").
 */
export async function DELETE() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const revoked = await revokeAllSessions(auth.userId, auth.sessionId ?? undefined);

  return NextResponse.json({ revoked });
}
