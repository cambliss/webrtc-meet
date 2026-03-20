# Cambliss Meet Security Hardening Plan

## Scope
This plan covers:
- Invite link traceability with referral chains.
- Participant attribution in meeting UI.
- Unauthorized join detection and host security actions.
- Device fingerprinting and session telemetry.
- Super admin audit logs.
- Host/admin controls for remove, block, and lock.

## Current Baseline
The current system already has:
- Meeting and participant data tables.
- Waiting room admit/reject flow in signaling server.
- Workspace RBAC (owner/admin/member).
- Host/participant roles in live room state.

Missing for enterprise security:
- Invite-token model and attribution chain.
- Device/IP/session audit model.
- Blocking and meeting lock enforcement.
- Super admin log endpoints/UI.

## Target Architecture

### 1) Invite Graph Model
Each participant gets a unique invite token URL:
- Example: /meeting/{roomId}?invite={token}
- Token is bound to meeting and inviter identity.

When invitees generate their own invite links, chain is preserved:
- Token T2 created by participant Ajay will store parent token T1 (Rahul).
- Attribution shown as: "Ajay - Joined via Rahul".

Core rules:
- Tokens can be one-time or multi-use based on policy.
- Token can be revoked by host/admin.
- Optional expiry and max-join count.

### 2) Join Decision Pipeline
Join requests should pass through a centralized decision flow in signaling server:
1. Parse invite token (if present).
2. Resolve inviter relationship from token.
3. Collect security telemetry (IP, UA, fingerprint, session id).
4. Evaluate controls:
   - meeting lock status
   - blocked IP/device checks
   - token validity
5. Determine status:
   - admitted
   - waiting
   - denied
6. Emit security alerts to host when suspicious.

### 3) Security Telemetry Capture
Capture and store per join session:
- session_id (server-generated UUID)
- meeting_id
- participant identity (user id or guest handle)
- invite_token_id and inviter
- device_fingerprint
- user agent, browser, OS, device type
- ip_address
- joined_at, left_at
- decision and reason

### 4) Security Event Stream
Create explicit event model in DB and Socket.IO:
- event types: unauthorized_join_attempt, blocked_ip_attempt, blocked_device_attempt, lock_violation
- host receives live alert card with action buttons
- all events persisted for super admin review

### 5) Control Plane
Host and super admin controls:
- Remove participant now
- Block device
- Block IP
- Lock meeting (deny all new joins except optional allowlist)

Enforcement points:
- On join-room event
- On reconnect attempts

## Database Changes

### A) Invite and Attribution Tables
```sql
CREATE TABLE IF NOT EXISTS meeting_invite_tokens (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  inviter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  inviter_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  parent_token_id UUID REFERENCES meeting_invite_tokens(id) ON DELETE SET NULL,
  created_by_session_id UUID,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_invite_tokens_meeting_id
  ON meeting_invite_tokens(meeting_id);
```

### B) Join Sessions and Device Telemetry
```sql
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
);

CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_meeting_id_joined_at
  ON meeting_join_sessions(meeting_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_device_fingerprint
  ON meeting_join_sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_ip_address
  ON meeting_join_sessions(ip_address);
```

### C) Blocking and Locking
```sql
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
);

CREATE INDEX IF NOT EXISTS idx_meeting_security_blocks_lookup
  ON meeting_security_blocks(workspace_id, meeting_id, block_type, block_value);

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
```

### D) Audit Event Table (Super Admin)
```sql
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
);

CREATE INDEX IF NOT EXISTS idx_meeting_security_events_workspace_created
  ON meeting_security_events(workspace_id, created_at DESC);
```

## API and Signaling Contract Updates

### Join payload updates
Add optional fields from client:
- inviteToken
- deviceFingerprint
- clientSessionId

### New REST endpoints
Host-level:
- POST /api/meetings/{meetingId}/invites
- GET /api/meetings/{meetingId}/invites
- POST /api/meetings/{meetingId}/security/block-device
- POST /api/meetings/{meetingId}/security/block-ip
- POST /api/meetings/{meetingId}/lock
- POST /api/meetings/{meetingId}/unlock

Super admin:
- GET /api/admin/security/events
- GET /api/admin/meetings/{meetingId}/audit

### New socket events
Server -> host:
- security-alert
- participant-attribution-updated

Host -> server:
- host-security-action (allow/remove/block_device/block_ip)
- meeting-lock-toggle

## UI Changes

### Meeting Room right panel
For each participant card:
- Name
- Tag: Invited by: {name}
- Risk flag if unauthorized/suspicious
- Quick actions for host

### Host security alert modal
Fields:
- Participant name
- Invited by
- Device type
- IP address
- Fingerprint short id
Actions:
- Allow
- Remove
- Block device
- Block IP

### Super admin dashboard
Pages:
- Meeting audit timeline
- Security events list with filters (date, meeting, IP, fingerprint, severity)
- Participant relationship graph for invite chain

## Device Fingerprinting Strategy
Use a browser-safe fingerprinting method (no MAC address):
- Combine userAgent, platform, language, timezone, screen params, canvas/audio entropy.
- Prefer open source client library for consistency.
- Hash on client (SHA-256) and send only hash.

Privacy and compliance:
- Display consent notice in policy.
- Treat fingerprint as pseudonymous identifier.
- Retention policy and purge tooling required.

## Security Rules and Detection Heuristics
Flag as suspicious when:
- Join uses revoked/expired token.
- Join from unknown token source while meeting is private.
- Multiple rapid joins from same fingerprint across meetings.
- IP mismatch patterns for same token in short interval.

Severity mapping:
- warning: unknown source but admitted to waiting.
- critical: blocked device/IP attempted join.

## Development Timeline

### Phase 0 (2-3 days): Design + Migration Readiness
- Finalize schema migration scripts.
- Add feature flags for secure join pipeline.
- Define API contracts and socket event schemas.

### Phase 1 (5-7 days): Core Invite Traceability
- Implement invite token creation/validation.
- Add attribution chain resolution.
- Display "Invited by" in participant panel.

### Phase 2 (5-7 days): Join Telemetry + Unauthorized Alerts
- Capture fingerprint, UA, IP, session.
- Persist join sessions and security events.
- Host alert UI and allow/remove action.

### Phase 3 (4-6 days): Block/Lock Controls
- Block device/IP controls with DB-backed enforcement.
- Meeting lock/unlock behavior in signaling path.
- Reconnect and race condition hardening.

### Phase 4 (5-7 days): Super Admin Audit Panel
- Build event list and meeting audit timeline.
- Export and filtering capabilities.
- Add operational dashboards.

### Phase 5 (3-4 days): QA, Load, Security Testing
- Abuse scenarios and regression suite.
- Performance test on join spikes.
- Pen-test checklist and rollout gate.

Estimated total: 4-6 weeks including QA and staged rollout.

## Rollout and Risk Controls
- Release behind feature flags per workspace.
- Start with pilot workspaces.
- Add observability metrics:
  - join decision counts
  - alert volume
  - false-positive rate
  - block action outcomes

Fallback:
- Ability to disable strict enforcement and keep monitoring-only mode.

## Team Split Recommendation
- Backend (2 engineers): signaling pipeline, API, DB, enforcement.
- Frontend (1-2 engineers): host security UX, attribution tags, admin views.
- QA/SRE (1 engineer): test matrix, monitoring, rollout guardrails.

## Planning Session Agenda (Suggested)
1. Confirm policy defaults (token expiry, one-time links, lock behavior).
2. Finalize data retention and privacy posture.
3. Approve API and socket contracts.
4. Sequence rollout by feature flags.
5. Define acceptance criteria per phase.
