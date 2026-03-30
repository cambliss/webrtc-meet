-- PostgreSQL schema for multi-tenant workspace support.
-- Required core tables: workspaces, users, workspace_members, meetings.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  -- Compatibility fields used by current app code.
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Compatibility field used by current app seed/query helpers.
  slug TEXT UNIQUE,
  brand_name TEXT,
  logo_url TEXT,
  custom_domain TEXT,
  primary_color TEXT,
  secondary_color TEXT
);

CREATE TABLE IF NOT EXISTS workspace_api_keys (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  -- Compatibility column retained for existing usage.
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price NUMERIC(10,2) NOT NULL,
  max_participants INTEGER,
  max_meeting_minutes INTEGER,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  webinar_mode BOOLEAN NOT NULL DEFAULT FALSE,
  analytics_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'canceled', 'expired')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'live', 'ended')) DEFAULT 'scheduled',
  -- Compatibility fields used by current app code paths.
  room_id TEXT UNIQUE,
  host_user_id TEXT,
  recording_path TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Migration-safe columns for older local DBs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS host_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_path TEXT;

DO $$
BEGIN
  ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
  ALTER TABLE workspace_members
    ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Existing app tables retained for transcripts/summaries.
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'participant')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  socket_id TEXT,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_summaries (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sender_id TEXT,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_files (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sender_id TEXT,
  sender_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

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

CREATE TABLE IF NOT EXISTS meeting_tasks (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_name TEXT,
  due_date DATE,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'canceled')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  source_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_highlights (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_search_documents (
  meeting_id UUID PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_secure_messages (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  auth_tag_b64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_secure_files (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploader_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  auth_tag_b64 TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS direct_message_files (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  encryption_key_version TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE direct_message_files ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE direct_message_files ADD COLUMN IF NOT EXISTS encryption_key_version TEXT;

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  scope TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, actor_key, idempotency_key)
);

CREATE TABLE IF NOT EXISTS api_rate_limit_counters (
  scope TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, actor_key, window_start)
);

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_email ON workspace_invites(workspace_id, email);
CREATE INDEX IF NOT EXISTS idx_meetings_workspace_id_created_at ON meetings(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_workspace_revoked ON workspace_api_keys(workspace_id, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_api_keys_prefix ON workspace_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_status_dates ON subscriptions(workspace_id, status, start_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_razorpay_order_id ON subscriptions(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participants_meeting_id ON participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id_created_at ON transcripts(meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_meeting_id_created_at ON meeting_summaries(meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_meeting_id_sent_at ON chat_messages(meeting_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting_id_shared_at ON meeting_files(meeting_id, shared_at);
CREATE INDEX IF NOT EXISTS idx_meeting_invite_tokens_meeting_id ON meeting_invite_tokens(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_meeting_id_joined_at ON meeting_join_sessions(meeting_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_device_fingerprint ON meeting_join_sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_meeting_join_sessions_ip_address ON meeting_join_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_meeting_security_blocks_lookup ON meeting_security_blocks(workspace_id, meeting_id, block_type, block_value);
CREATE INDEX IF NOT EXISTS idx_meeting_security_events_workspace_created ON meeting_security_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_workspace_meeting ON meeting_tasks(workspace_id, meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_search_documents_workspace ON meeting_search_documents(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_search_documents_tsv ON meeting_search_documents USING GIN (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_workspace_secure_messages_workspace_created ON workspace_secure_messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_secure_files_workspace_created ON workspace_secure_files(workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_secure_files_storage_name ON workspace_secure_files(storage_name);
CREATE INDEX IF NOT EXISTS idx_direct_messages_workspace_recipient ON direct_messages(workspace_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(workspace_id, sender_user_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_direct_message_files_recipient ON direct_message_files(workspace_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_claimable ON background_jobs(status, run_after, created_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status ON background_jobs(job_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_expiry ON api_idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_rate_limit_counters_updated ON api_rate_limit_counters(updated_at);

-- Demo seed records aligned with current hardcoded users.
INSERT INTO users (id, name, email, password_hash, username, display_name)
VALUES
  ('host-1', 'Host User', 'host@example.com', 'demo_hash_host', 'host', 'Host User'),
  ('participant-1', 'Participant User', 'participant@example.com', 'demo_hash_participant', 'participant', 'Participant User'),
  ('host-2', 'Host Two', 'host2@example.com', 'demo_hash_host2', 'host2', 'Host Two')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspaces (id, name, owner_id, slug)
VALUES
  ('workspace-acme', 'Acme Corp', 'host-1', 'acme'),
  ('workspace-globex', 'Globex', 'host-2', 'globex')
ON CONFLICT (id) DO NOTHING;

INSERT INTO plans (
  id,
  name,
  price,
  max_participants,
  max_meeting_minutes,
  recording_enabled,
  ai_enabled,
  webinar_mode,
  analytics_enabled,
  priority_support
)
VALUES
  ('free', 'Free', 0, 5, 40, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('pro', 'Pro', 1999, 50, NULL, TRUE, TRUE, FALSE, FALSE, FALSE),
  ('enterprise', 'Enterprise', 1, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  max_participants = EXCLUDED.max_participants,
  max_meeting_minutes = EXCLUDED.max_meeting_minutes,
  recording_enabled = EXCLUDED.recording_enabled,
  ai_enabled = EXCLUDED.ai_enabled,
  webinar_mode = EXCLUDED.webinar_mode,
  analytics_enabled = EXCLUDED.analytics_enabled,
  priority_support = EXCLUDED.priority_support;

INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES
  ('workspace-acme', 'host-1', 'owner'),
  ('workspace-acme', 'participant-1', 'member'),
  ('workspace-globex', 'host-2', 'owner')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO subscriptions (id, workspace_id, plan_id, start_date, end_date, status)
SELECT '11111111-1111-1111-1111-111111111111', 'workspace-acme', 'free', NOW(), NULL, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.workspace_id = 'workspace-acme' AND s.status = 'active'
);

INSERT INTO subscriptions (id, workspace_id, plan_id, start_date, end_date, status)
SELECT '22222222-2222-2222-2222-222222222222', 'workspace-globex', 'free', NOW(), NULL, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.workspace_id = 'workspace-globex' AND s.status = 'active'
);
