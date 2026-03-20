import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

/**
 * GET /api/integrations/google/callback
 *
 * Handles the OAuth callback from Google after the user grants calendar/gmail
 * access.  Exchanges the code for tokens and stores the access_token in an
 * httpOnly cookie so other API routes can use it.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (errorParam) {
    return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=${encodeURIComponent(errorParam)}`);
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=state_mismatch`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=no_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? `${appUrl}/api/integrations/google/callback`;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=misconfigured`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=token_exchange`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=no_access_token`);
    }

    const expiresIn = tokenData.expires_in ?? 3600;

    const response = NextResponse.redirect(`${appUrl}/dashboard?calendar=connected`);

    // Store access_token (short-lived) in httpOnly cookie
    response.cookies.set("google_calendar_token", tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn,
      path: "/",
    });

    // Clear CSRF state cookie
    response.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/" });

    return response;
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard?calendar=error&reason=server_error`);
  }
}
