import { serialize } from "cookie";
import { NextResponse } from "next/server";

import { createUserAccount, signAuthToken } from "@/src/lib/auth";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";

export async function POST(req: Request) {
  const ip = getRequestIp(req);
  const signupLimit = await checkRateLimit({
    scope: "auth-signup",
    key: buildRateLimitKey([ip]),
    limit: Number(process.env.RATE_LIMIT_AUTH_SIGNUP_PER_10_MIN || "8"),
    windowMs: 10 * 60 * 1000,
  });

  if (!signupLimit.allowed) {
    const response = NextResponse.json(
      { error: "Too many signup attempts. Please try again later." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(signupLimit.retryAfterSeconds));
    return response;
  }

  const payload = (await req.json()) as {
    fullName?: string;
    email?: string;
    username?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (!payload.fullName || !payload.email || !payload.username || !payload.password || !payload.confirmPassword) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  if (payload.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  if (payload.password !== payload.confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const created = await createUserAccount({
    fullName: payload.fullName,
    email: payload.email,
    username: payload.username,
    password: payload.password,
  });

  if (!created.user) {
    return NextResponse.json({ error: created.error || "Failed to create account." }, { status: 400 });
  }

  const token = signAuthToken(created.user);

  const response = NextResponse.json({ success: true, user: created.user });
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
