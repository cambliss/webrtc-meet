import { createHash, randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

export type ResolvedMeeting = {
  meetingId: string;
  workspaceId: string;
  roomId: string;
  hostId: string;
};

export type InviteTokenRecord = {
  id: string;
  meetingId: string;
  workspaceId: string;
  inviterUserId: string | null;
  inviterName: string | null;
  parentTokenId: string | null;
};

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function ensureMeetingSecuritySchema(): Promise<void> {
  const pool = getDbPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_invite_tokens (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      inviter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      parent_token_id UUID REFERENCES meeting_invite_tokens(id) ON DELETE SET NULL,
      created_by_session_id UUID,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_join_sessions (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      participant_user_id TEXT,
      participant_display_name TEXT NOT NULL,
      socket_id TEXT,
      invite_token_id UUID REFERENCES meeting_invite_tokens(id) ON DELETE SET NULL,
      invited_by_user_id TEXT,
      device_fingerprint TEXT,
      user_agent TEXT,
      browser_name TEXT,
      browser_version TEXT,
      os_name TEXT,
      os_version TEXT,
      device_type TEXT,
      ip_address INET,
      decision TEXT NOT NULL CHECK (decision IN ('admitted','waiting','denied','blocked')),
      decision_reason TEXT,
      session_token_hash TEXT,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_security_blocks (
      id UUID PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
      block_type TEXT NOT NULL CHECK (block_type IN ('device','ip')),
      block_value TEXT NOT NULL,
      reason TEXT,
      blocked_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_security_events (
      id UUID PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
      join_session_id UUID REFERENCES meeting_join_sessions(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
      actor_user_id TEXT,
      participant_display_name TEXT,
      invited_by_user_id TEXT,
      device_fingerprint TEXT,
      ip_address INET,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS locked_by_user_id TEXT,
      ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_meeting_invite_tokens_meeting_id ON meeting_invite_tokens(meeting_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_meeting_id_joined_at ON meeting_join_sessions(meeting_id, joined_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_device_fingerprint ON meeting_join_sessions(device_fingerprint)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_ip_address ON meeting_join_sessions(ip_address)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_meeting_security_blocks_lookup ON meeting_security_blocks(workspace_id, meeting_id, block_type, block_value)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_meeting_security_events_workspace_created ON meeting_security_events(workspace_id, created_at DESC)");
}

export async function resolveMeetingByIdOrRoomId(meetingIdOrRoomId: string): Promise<ResolvedMeeting | null> {
  const pool = getDbPool();
  const result = await pool.query<{ id: string; workspace_id: string; room_id: string; host_id: string }>(
    `
    SELECT id::text AS id, workspace_id, room_id, host_id
    FROM meetings
    WHERE id::text = $1 OR room_id = $1
    LIMIT 1
    `,
    [meetingIdOrRoomId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    meetingId: row.id,
    workspaceId: row.workspace_id,
    roomId: row.room_id,
    hostId: row.host_id,
  };
}

export async function createMeetingInviteToken(params: {
  meetingId: string;
  workspaceId: string;
  inviterUserId?: string | null;
  parentTokenId?: string | null;
  createdBySessionId?: string | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
}): Promise<{ tokenId: string; inviteToken: string }> {
  const pool = getDbPool();
  const tokenId = randomUUID();
  const inviteToken = randomUUID().replace(/-/g, "") + randomUUID().slice(0, 8);

  await pool.query(
    `
    INSERT INTO meeting_invite_tokens (
      id,
      meeting_id,
      workspace_id,
      token_hash,
      inviter_user_id,
      parent_token_id,
      created_by_session_id,
      max_uses,
      expires_at,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `,
    [
      tokenId,
      params.meetingId,
      params.workspaceId,
      hashInviteToken(inviteToken),
      params.inviterUserId || null,
      params.parentTokenId || null,
      params.createdBySessionId || null,
      params.maxUses || null,
      params.expiresAt || null,
    ],
  );

  return { tokenId, inviteToken };
}

export async function resolveInviteToken(params: {
  meetingId: string;
  inviteToken: string;
}): Promise<InviteTokenRecord | null> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    meeting_id: string;
    workspace_id: string;
    inviter_user_id: string | null;
    inviter_name: string | null;
    parent_token_id: string | null;
  }>(
    `
    SELECT
      t.id::text,
      t.meeting_id::text,
      t.workspace_id,
      t.inviter_user_id,
      COALESCE(u.display_name, u.username, u.name) AS inviter_name,
      t.parent_token_id::text
    FROM meeting_invite_tokens t
    LEFT JOIN users u ON u.id = t.inviter_user_id
    WHERE t.meeting_id = $1
      AND t.token_hash = $2
      AND t.revoked_at IS NULL
      AND (t.expires_at IS NULL OR t.expires_at > NOW())
      AND (t.max_uses IS NULL OR t.used_count < t.max_uses)
    LIMIT 1
    `,
    [params.meetingId, hashInviteToken(params.inviteToken)],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    workspaceId: row.workspace_id,
    inviterUserId: row.inviter_user_id,
    inviterName: row.inviter_name,
    parentTokenId: row.parent_token_id,
  };
}

export async function incrementInviteTokenUsage(tokenId: string): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE meeting_invite_tokens
    SET used_count = used_count + 1
    WHERE id = $1
    `,
    [tokenId],
  );
}

export async function isMeetingLocked(meetingId: string): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query<{ is_locked: boolean }>(
    `SELECT is_locked FROM meetings WHERE id::text = $1 LIMIT 1`,
    [meetingId],
  );

  return Boolean(result.rows[0]?.is_locked);
}

export async function setMeetingLock(params: {
  meetingId: string;
  locked: boolean;
  actorUserId?: string | null;
}): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE meetings
    SET
      is_locked = $2,
      locked_by_user_id = CASE WHEN $2 THEN $3 ELSE NULL END,
      locked_at = CASE WHEN $2 THEN NOW() ELSE NULL END
    WHERE id::text = $1
    `,
    [params.meetingId, params.locked, params.actorUserId || null],
  );
}

export async function isBlocked(params: {
  workspaceId: string;
  meetingId: string;
  deviceFingerprint?: string | null;
  ipAddress?: string | null;
}): Promise<{ blocked: boolean; reason: string | null }> {
  const pool = getDbPool();
  const checks: Array<{ type: "device" | "ip"; value: string }> = [];
  if (params.deviceFingerprint) {
    checks.push({ type: "device", value: params.deviceFingerprint });
  }
  if (params.ipAddress) {
    checks.push({ type: "ip", value: params.ipAddress });
  }

  if (checks.length === 0) {
    return { blocked: false, reason: null };
  }

  for (const check of checks) {
    const result = await pool.query<{ reason: string | null }>(
      `
      SELECT reason
      FROM meeting_security_blocks
      WHERE workspace_id = $1
        AND (meeting_id::text = $2 OR meeting_id IS NULL)
        AND block_type = $3
        AND block_value = $4
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [params.workspaceId, params.meetingId, check.type, check.value],
    );

    if (result.rows[0]) {
      return { blocked: true, reason: result.rows[0].reason || `${check.type} blocked` };
    }
  }

  return { blocked: false, reason: null };
}

export async function createSecurityBlock(params: {
  workspaceId: string;
  meetingId?: string | null;
  blockType: "device" | "ip";
  blockValue: string;
  reason?: string;
  actorUserId?: string | null;
  expiresAt?: Date | null;
}): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    INSERT INTO meeting_security_blocks (
      id,
      workspace_id,
      meeting_id,
      block_type,
      block_value,
      reason,
      blocked_by_user_id,
      created_at,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    `,
    [
      randomUUID(),
      params.workspaceId,
      params.meetingId || null,
      params.blockType,
      params.blockValue,
      params.reason || null,
      params.actorUserId || null,
      params.expiresAt || null,
    ],
  );
}

export async function createJoinSession(params: {
  meetingId: string;
  workspaceId: string;
  participantUserId?: string | null;
  participantDisplayName: string;
  socketId?: string | null;
  inviteTokenId?: string | null;
  invitedByUserId?: string | null;
  deviceFingerprint?: string | null;
  userAgent?: string | null;
  browserName?: string | null;
  browserVersion?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
  decision: "admitted" | "waiting" | "denied" | "blocked";
  decisionReason?: string | null;
  sessionTokenHash?: string | null;
}): Promise<string> {
  const pool = getDbPool();
  const id = randomUUID();

  await pool.query(
    `
    INSERT INTO meeting_join_sessions (
      id,
      meeting_id,
      workspace_id,
      participant_user_id,
      participant_display_name,
      socket_id,
      invite_token_id,
      invited_by_user_id,
      device_fingerprint,
      user_agent,
      browser_name,
      browser_version,
      os_name,
      os_version,
      device_type,
      ip_address,
      decision,
      decision_reason,
      session_token_hash,
      joined_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, NOW()
    )
    `,
    [
      id,
      params.meetingId,
      params.workspaceId,
      params.participantUserId || null,
      params.participantDisplayName,
      params.socketId || null,
      params.inviteTokenId || null,
      params.invitedByUserId || null,
      params.deviceFingerprint || null,
      params.userAgent || null,
      params.browserName || null,
      params.browserVersion || null,
      params.osName || null,
      params.osVersion || null,
      params.deviceType || null,
      params.ipAddress || null,
      params.decision,
      params.decisionReason || null,
      params.sessionTokenHash || null,
    ],
  );

  return id;
}

export async function closeJoinSessionBySocketId(socketId: string): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE meeting_join_sessions
    SET left_at = NOW()
    WHERE socket_id = $1
      AND left_at IS NULL
    `,
    [socketId],
  );
}

export async function createSecurityEvent(params: {
  workspaceId: string;
  meetingId?: string | null;
  joinSessionId?: string | null;
  eventType: string;
  severity: "info" | "warning" | "critical";
  actorUserId?: string | null;
  participantDisplayName?: string | null;
  invitedByUserId?: string | null;
  deviceFingerprint?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    INSERT INTO meeting_security_events (
      id,
      workspace_id,
      meeting_id,
      join_session_id,
      event_type,
      severity,
      actor_user_id,
      participant_display_name,
      invited_by_user_id,
      device_fingerprint,
      ip_address,
      metadata,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
    `,
    [
      randomUUID(),
      params.workspaceId,
      params.meetingId || null,
      params.joinSessionId || null,
      params.eventType,
      params.severity,
      params.actorUserId || null,
      params.participantDisplayName || null,
      params.invitedByUserId || null,
      params.deviceFingerprint || null,
      params.ipAddress || null,
      JSON.stringify(params.metadata || {}),
    ],
  );
}

export async function listSecurityEvents(params: {
  workspaceId?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const pool = getDbPool();
  const limit = Math.min(Math.max(params.limit || 200, 1), 500);

  const result = await pool.query(
    `
    SELECT
      e.id,
      e.workspace_id,
      e.meeting_id,
      e.join_session_id,
      e.event_type,
      e.severity,
      e.actor_user_id,
      e.participant_display_name,
      e.invited_by_user_id,
      e.device_fingerprint,
      e.ip_address::text AS ip_address,
      e.metadata,
      e.created_at,
      m.room_id,
      COALESCE(u.display_name, u.username, u.name) AS invited_by_name
    FROM meeting_security_events e
    LEFT JOIN meetings m ON m.id = e.meeting_id
    LEFT JOIN users u ON u.id = e.invited_by_user_id
    WHERE ($1::text IS NULL OR e.workspace_id = $1)
    ORDER BY e.created_at DESC
    LIMIT $2
    `,
    [params.workspaceId || null, limit],
  );

  return result.rows;
}
