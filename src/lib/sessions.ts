import { randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type DeviceInfo = {
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
};

export type UserSession = {
  id: string;
  userId: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  loginSuccess: boolean;
};

export type LoginAttemptRecord = {
  id: string;
  userId: string | null;
  identifier: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browserName: string | null;
  osName: string | null;
  success: boolean;
  failureReason: string | null;
  createdAt: string;
};

// Session TTL mirrors the JWT TTL (12 h).
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// UA parsing (self-contained, no external deps)
// ──────────────────────────────────────────────────────────────────────────────

export function detectDeviceType(ua: string | null | undefined): "desktop" | "mobile" | "tablet" | "unknown" {
  if (!ua) return "unknown";
  const lower = ua.toLowerCase();
  if (lower.includes("ipad") || lower.includes("tablet")) return "tablet";
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) return "mobile";
  return "desktop";
}

export function parseUserAgent(ua: string | null | undefined): Pick<DeviceInfo, "browserName" | "browserVersion" | "osName" | "osVersion"> {
  if (!ua) return { browserName: null, browserVersion: null, osName: null, osVersion: null };

  let browserName: string | null = null;
  let browserVersion: string | null = null;

  if (ua.includes("Edg/")) {
    browserName = "Edge";
    browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] ?? null;
  } else if (ua.includes("Chrome/")) {
    browserName = "Chrome";
    browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? null;
  } else if (ua.includes("Firefox/")) {
    browserName = "Firefox";
    browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? null;
  } else if (ua.includes("Safari/") && ua.includes("Version/")) {
    browserName = "Safari";
    browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] ?? null;
  }

  let osName: string | null = null;
  let osVersion: string | null = null;

  if (ua.includes("Windows NT")) {
    osName = "Windows";
    osVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] ?? null;
  } else if (ua.includes("Mac OS X")) {
    osName = "macOS";
    osVersion = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") ?? null;
  } else if (ua.includes("Android")) {
    osName = "Android";
    osVersion = ua.match(/Android ([\d.]+)/)?.[1] ?? null;
  } else if (ua.includes("iPhone OS") || ua.includes("iPad; CPU OS")) {
    osName = "iOS";
    osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") ?? null;
  } else if (ua.includes("Linux")) {
    osName = "Linux";
  }

  return { browserName, browserVersion, osName, osVersion };
}

export function buildDeviceInfo(request: Request): DeviceInfo {
  const ua = request.headers.get("user-agent");
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  const { browserName, browserVersion, osName, osVersion } = parseUserAgent(ua);

  return {
    ipAddress: ip ? ip.slice(0, 120) : null,
    userAgent: ua ? ua.slice(0, 512) : null,
    deviceType: detectDeviceType(ua),
    browserName,
    browserVersion,
    osName,
    osVersion,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Schema bootstrap
// ──────────────────────────────────────────────────────────────────────────────

export async function ensureSessionsSchema(): Promise<void> {
  const pool = getDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      revoke_reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      device_type TEXT,
      browser_name TEXT,
      browser_version TEXT,
      os_name TEXT,
      os_version TEXT,
      login_success BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_login_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT,
      identifier TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      device_type TEXT,
      browser_name TEXT,
      os_name TEXT,
      success BOOLEAN NOT NULL,
      failure_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, revoked_at, expires_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_login_attempts_user ON user_login_attempts(user_id, created_at DESC)`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Session CRUD
// ──────────────────────────────────────────────────────────────────────────────

export async function createSession(userId: string, device: DeviceInfo): Promise<string> {
  await ensureSessionsSchema();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO user_sessions
       (id, user_id, expires_at, ip_address, user_agent, device_type, browser_name, browser_version, os_name, os_version, login_success)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
    [
      id,
      userId,
      expiresAt,
      device.ipAddress,
      device.userAgent,
      device.deviceType,
      device.browserName,
      device.browserVersion,
      device.osName,
      device.osVersion,
    ],
  );
  return id;
}

export async function touchSession(sessionId: string): Promise<void> {
  try {
    const pool = getDbPool();
    await pool.query(
      `UPDATE user_sessions SET last_active_at = NOW() WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [sessionId],
    );
  } catch {
    // Best-effort; never block the request.
  }
}

export async function isSessionActive(sessionId: string): Promise<boolean> {
  try {
    const pool = getDbPool();
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM user_sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [sessionId],
    );
    return result.rows.length > 0;
  } catch {
    // If DB is down, fallback to trusting JWT alone.
    return true;
  }
}

export async function revokeSession(
  sessionId: string,
  userId: string,
  reason: "logout" | "remote_logout" | "logout_all" | "suspicious" = "remote_logout",
): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = $3
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [sessionId, userId, reason],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const pool = getDbPool();
  const result = await pool.query(
    `UPDATE user_sessions
     SET revoked_at = NOW(), revoke_reason = 'logout_all'
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND ($2::TEXT IS NULL OR id != $2)
     RETURNING id`,
    [userId, exceptSessionId ?? null],
  );
  return result.rowCount ?? 0;
}

export async function listActiveSessions(userId: string): Promise<UserSession[]> {
  await ensureSessionsSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: string;
    last_active_at: string;
    expires_at: string;
    revoked_at: string | null;
    revoke_reason: string | null;
    ip_address: string | null;
    user_agent: string | null;
    device_type: string;
    browser_name: string | null;
    browser_version: string | null;
    os_name: string | null;
    os_version: string | null;
    login_success: boolean;
  }>(
    `SELECT * FROM user_sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY last_active_at DESC
     LIMIT 50`,
    [userId],
  );
  return result.rows.map(rowToSession);
}

export async function listLoginHistory(userId: string, limit = 50): Promise<UserSession[]> {
  await ensureSessionsSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: string;
    last_active_at: string;
    expires_at: string;
    revoked_at: string | null;
    revoke_reason: string | null;
    ip_address: string | null;
    user_agent: string | null;
    device_type: string;
    browser_name: string | null;
    browser_version: string | null;
    os_name: string | null;
    os_version: string | null;
    login_success: boolean;
  }>(
    `SELECT * FROM user_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(rowToSession);
}

function rowToSession(row: {
  id: string;
  user_id: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string;
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  os_version: string | null;
  login_success: boolean;
}): UserSession {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceType: (row.device_type as "desktop" | "mobile" | "tablet" | "unknown") || "unknown",
    browserName: row.browser_name,
    browserVersion: row.browser_version,
    osName: row.os_name,
    osVersion: row.os_version,
    loginSuccess: row.login_success,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Login attempt logging
// ──────────────────────────────────────────────────────────────────────────────

export async function recordLoginAttempt(params: {
  userId: string | null;
  identifier: string;
  device: DeviceInfo;
  success: boolean;
  failureReason?: string;
}): Promise<void> {
  try {
    await ensureSessionsSchema();
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO user_login_attempts
         (user_id, identifier, ip_address, user_agent, device_type, browser_name, os_name, success, failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        params.userId,
        params.identifier.toLowerCase().slice(0, 256),
        params.device.ipAddress,
        params.device.userAgent,
        params.device.deviceType,
        params.device.browserName,
        params.device.osName,
        params.success,
        params.failureReason ?? null,
      ],
    );
  } catch {
    // Never block login for analytics failures.
  }
}

export async function listLoginAttempts(userId: string, limit = 30): Promise<LoginAttemptRecord[]> {
  await ensureSessionsSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    user_id: string | null;
    identifier: string;
    ip_address: string | null;
    user_agent: string | null;
    device_type: string | null;
    browser_name: string | null;
    os_name: string | null;
    success: boolean;
    failure_reason: string | null;
    created_at: string;
  }>(
    `SELECT * FROM user_login_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    identifier: row.identifier,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceType: row.device_type,
    browserName: row.browser_name,
    osName: row.os_name,
    success: row.success,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// "New device" detection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when this is a login from a browser/OS combination that the user
 * has never logged in from before (checked against the last 30 sessions).
 */
export async function isNewDevice(userId: string, device: DeviceInfo): Promise<boolean> {
  try {
    const pool = getDbPool();
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM user_sessions
       WHERE user_id = $1
         AND browser_name IS NOT DISTINCT FROM $2
         AND os_name IS NOT DISTINCT FROM $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, device.browserName, device.osName],
    );
    return result.rows.length === 0;
  } catch {
    return false;
  }
}
