import { serialize } from "cookie";
import { NextResponse } from "next/server";

import { getUserForLogin, signAuthToken } from "@/src/lib/auth";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";

export async function POST(req: Request) {
  const ip = getRequestIp(req);
  const payload = (await req.json()) as {
    identifier?: string;
    password?: string;
  };

  const limit = await checkRateLimit({
    scope: "auth-login",
    key: buildRateLimitKey([ip, payload.identifier || "anonymous"]),
    limit: Number(process.env.RATE_LIMIT_AUTH_LOGIN_PER_10_MIN || "20"),
    windowMs: 10 * 60 * 1000,
  });

  if (!limit.allowed) {
    const response = NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  if (!payload.identifier || !payload.password) {
    return NextResponse.json({ error: "Email/username and password are required." }, { status: 400 });
  }

  const user = await getUserForLogin(payload.identifier, payload.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = signAuthToken(user);

  const response = NextResponse.json({
    user,
    success: true,
  });

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
