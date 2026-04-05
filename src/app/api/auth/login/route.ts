import { serialize } from "cookie";
import { NextResponse } from "next/server";

import { getUserForLogin, signAuthTokenWithSession } from "@/src/lib/auth";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";
import {
  buildDeviceInfo,
  createSession,
  isNewDevice,
  recordLoginAttempt,
} from "@/src/lib/sessions";
import { sendNewDeviceLoginEmail } from "@/src/lib/email";
import { getDbPool } from "@/src/lib/db";

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
  const device = buildDeviceInfo(req);

  if (!user) {
    void recordLoginAttempt({
      userId: null,
      identifier: payload.identifier ?? "",
      device,
      success: false,
      failureReason: "invalid_credentials",
    });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  // Create a DB session record and embed the sessionId in the JWT.
  let sessionId: string | null = null;
  try {
    sessionId = await createSession(user.id, device);
  } catch {
    // Non-critical — fall back to session-less JWT if DB is unavailable.
  }

  const token = sessionId
    ? signAuthTokenWithSession(user, sessionId)
    : (await import("@/src/lib/auth").then((m) => m.signAuthToken(user)));

  void recordLoginAttempt({ userId: user.id, identifier: payload.identifier ?? "", device, success: true });

  // Send new-device email alert asynchronously.
  if (sessionId) {
    void (async () => {
      try {
        const newDevice = await isNewDevice(user.id, device);
        if (newDevice) {
          const pool = getDbPool();
          const emailRow = await pool.query<{ email: string }>(
            "SELECT email FROM users WHERE id = $1 LIMIT 1",
            [user.id],
          );
          const email = emailRow.rows[0]?.email;
          if (email) {
            const baseUrl = req.headers.get("origin") || process.env.NEXTAUTH_URL || "";
            await sendNewDeviceLoginEmail({
              toEmail: email,
              username: user.username,
              ipAddress: device.ipAddress,
              browserName: device.browserName,
              osName: device.osName,
              deviceType: device.deviceType,
              loginTime: new Date(),
              sessionsUrl: `${baseUrl}/dashboard/sessions`,
            });
          }
        }
      } catch {
        // Never block login for email failures.
      }
    })();
  }

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
