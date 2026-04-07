import { randomBytes } from "node:crypto";

import { serialize } from "cookie";
import { NextRequest, NextResponse } from "next/server";

import { createGoogleDemoUser, signAuthToken } from "@/src/lib/auth";
import { resolveAppBaseUrl } from "@/src/lib/resolveAppBaseUrl";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(req: NextRequest) {
  const appUrl = resolveAppBaseUrl(req);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const configuredRedirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI?.trim();
  let redirectUri = configuredRedirectUri || `${appUrl}/api/auth/google/callback`;

  if (process.env.NODE_ENV === "production") {
    try {
      const redirectHost = new URL(redirectUri).hostname.toLowerCase();
      if (redirectHost === "localhost" || redirectHost === "127.0.0.1" || redirectHost === "::1") {
        redirectUri = `${appUrl}/api/auth/google/callback`;
      }
    } catch {
      redirectUri = `${appUrl}/api/auth/google/callback`;
    }
  }

  const redirectOrigin = new URL(redirectUri).origin;

  if (req.nextUrl.origin !== redirectOrigin) {
    return NextResponse.redirect(new URL("/api/auth/google", redirectOrigin));
  }

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
