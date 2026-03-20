import { randomBytes } from "node:crypto";

import { serialize } from "cookie";
import { NextResponse } from "next/server";

import { createGoogleDemoUser, signAuthToken } from "@/src/lib/auth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    const user = createGoogleDemoUser();
    const token = signAuthToken(user);

    const response = NextResponse.redirect(new URL("/dashboard", appUrl));
    response.headers.set(
      "Set-Cookie",
      serialize("meeting_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
      }),
    );

    return response;
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  response.headers.set(
    "Set-Cookie",
    serialize("google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    }),
  );

  return response;
}
