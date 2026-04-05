import { serialize } from "cookie";
import { NextResponse } from "next/server";
import { resolveAppBaseUrl } from "@/src/lib/resolveAppBaseUrl";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/src/lib/auth";
import { revokeSession } from "@/src/lib/sessions";

export async function POST(req: Request) {
  const loginUrl = new URL("/login", resolveAppBaseUrl(req));

  // Revoke the DB session so it disappears from the sessions list immediately.
  try {
    const token = (await cookies()).get("meeting_token")?.value;
    const auth = token ? verifyAuthToken(token) : null;
    if (auth?.sessionId) {
      void revokeSession(auth.sessionId, auth.userId, "logout");
    }
  } catch {
    // Non-blocking.
  }

  const response = NextResponse.redirect(loginUrl);

  response.headers.set(
    "Set-Cookie",
    serialize("meeting_token", "", {
      path: "/",
      httpOnly: true,
      expires: new Date(0),
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    }),
  );

  return response;
}
