import { serialize } from "cookie";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { signAuthToken, upsertGoogleUserAccount } from "@/src/lib/auth";
import { resolveAppBaseUrl } from "@/src/lib/resolveAppBaseUrl";

type GoogleTokenResponse = {
  id_token?: string;
  error?: string;
};

type GoogleIdTokenPayload = {
  email?: string;
  name?: string;
};

function parseJwtPayload(token: string): GoogleIdTokenPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(decoded) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const appUrl = resolveAppBaseUrl(req);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI || `${appUrl}/api/auth/google/callback`;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = (await cookies()).get("google_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=google_state", appUrl));
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google_config", appUrl));
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/login?error=google_token", appUrl));
  }

  const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenPayload.id_token) {
    return NextResponse.redirect(new URL("/login?error=google_id_token", appUrl));
  }

  const profile = parseJwtPayload(tokenPayload.id_token);
  if (!profile?.email) {
    return NextResponse.redirect(new URL("/login?error=google_profile", appUrl));
  }

  const user = await upsertGoogleUserAccount({ email: profile.email, name: profile.name });
  const authToken = signAuthToken(user);

  const response = NextResponse.redirect(new URL("/dashboard", appUrl));
  response.headers.set(
    "Set-Cookie",
    serialize("meeting_token", authToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    }),
  );

  response.headers.append(
    "Set-Cookie",
    serialize("google_oauth_state", "", {
      path: "/",
      httpOnly: true,
      expires: new Date(0),
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    }),
  );

  return response;
}
