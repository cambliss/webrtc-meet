import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

import { getDbPool } from "@/src/lib/db";
import { hashPassword, verifyPassword } from "@/src/lib/password";
import type { AppUser, UserRole } from "@/src/types/auth";

function getJwtSecret(): string {
  return process.env.JWT_SECRET || "dev-only-secret-change-me";
}

export type AuthTokenPayload = {
  userId: string;
  username: string;
  role: UserRole;
  workspaceId: string;
};

type AuthRecord = AppUser & {
  email: string;
  displayName?: string;
  password?: string;
  passwordHash?: string;
};

const TOKEN_TTL = "12h";

const demoUsers: AuthRecord[] = [
  {
    id: "host-1",
    username: "host",
    role: "host",
    password: "host123",
    workspaceId: "workspace-acme",
    email: "host@example.com",
    displayName: "Host User",
  },
  {
    id: "participant-1",
    username: "participant",
    role: "participant",
    password: "participant123",
    workspaceId: "workspace-acme",
    email: "participant@example.com",
    displayName: "Participant User",
  },
  {
    id: "host-2",
    username: "host2",
    role: "host",
    password: "host123",
    workspaceId: "workspace-globex",
    email: "host2@example.com",
    displayName: "Host Two",
  },
];

const runtimeUsersByUsername = new Map<string, AuthRecord>();
const runtimeUsersByEmail = new Map<string, AuthRecord>();

function findByIdentifier(identifier: string): AuthRecord | null {
  const normalized = identifier.trim().toLowerCase();
  const runtime = runtimeUsersByUsername.get(normalized) || runtimeUsersByEmail.get(normalized);

  if (runtime) {
    return runtime;
  }

  return (
    demoUsers.find((user) => user.username === normalized || user.email.toLowerCase() === normalized) ||
    null
  );
}

function toAppUser(record: AuthRecord): AppUser {
  return {
    id: record.id,
    username: record.username,
    role: record.role,
    workspaceId: record.workspaceId,
  };
}

async function getDbUser(identifier: string, password: string): Promise<AppUser | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || !password) {
    return null;
  }

  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    username: string | null;
    email: string;
    password_hash: string;
    workspace_id: string | null;
    app_role: UserRole;
  }>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      COALESCE(owned.id, member.workspace_id) AS workspace_id,
      CASE
        WHEN owned.id IS NOT NULL OR member.role IN ('owner', 'admin') THEN 'host'
        ELSE 'participant'
      END AS app_role
    FROM users u
    LEFT JOIN LATERAL (
      SELECT w.id
      FROM workspaces w
      WHERE w.owner_id = u.id
      ORDER BY w.created_at ASC
      LIMIT 1
    ) owned ON TRUE
    LEFT JOIN LATERAL (
      SELECT wm.workspace_id, wm.role
      FROM workspace_members wm
      WHERE wm.user_id = u.id
      ORDER BY
        CASE wm.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          ELSE 2
        END,
        wm.joined_at ASC
      LIMIT 1
    ) member ON TRUE
    WHERE LOWER(u.email) = $1 OR LOWER(COALESCE(u.username, '')) = $1
    LIMIT 1
    `,
    [normalized],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (!verifyPassword(password, row.password_hash)) {
    return null;
  }

  return {
    id: row.id,
    username: (row.username || row.email.split("@")[0] || "user").toLowerCase(),
    role: row.app_role,
    workspaceId: row.workspace_id || "workspace-acme",
  };
}

export function signAuthToken(user: AppUser): string {
  const payload: AuthTokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    workspaceId: user.workspaceId,
  };

  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

function parseDelimitedEnvList(rawValue: string | undefined): Set<string> {
  if (!rawValue) {
    return new Set();
  }

  const values = rawValue
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set(values);
}

export function isSuperAdminAuth(
  auth: Pick<AuthTokenPayload, "userId" | "username"> | null | undefined,
): boolean {
  if (!auth) {
    return false;
  }

  const superAdminUserIds = parseDelimitedEnvList(process.env.SUPER_ADMIN_USER_IDS);
  const superAdminUsernames = parseDelimitedEnvList(process.env.SUPER_ADMIN_USERNAMES);

  const userId = auth.userId.trim().toLowerCase();
  const username = auth.username.trim().toLowerCase();

  return superAdminUserIds.has(userId) || superAdminUsernames.has(username);
}

export function getDemoUser(identifier: string, password: string): AppUser | null {
  const matched = findByIdentifier(identifier);

  if (!matched) {
    return null;
  }

  if (matched.passwordHash) {
    if (!verifyPassword(password, matched.passwordHash)) {
      return null;
    }

    return toAppUser(matched);
  }

  if (matched.password !== password) {
    return null;
  }

  return toAppUser(matched);
}

export async function getUserForLogin(identifier: string, password: string): Promise<AppUser | null> {
  try {
    const dbUser = await getDbUser(identifier, password);
    if (dbUser) {
      return dbUser;
    }
  } catch {
    // Fall back to in-memory demo/runtime auth when DB is unavailable.
  }

  return getDemoUser(identifier, password);
}

async function findDefaultWorkspaceIdWithQuery(
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string }> }>,
): Promise<string | null> {
  const configuredWorkspaceId = process.env.DEFAULT_WORKSPACE_ID?.trim();
  if (configuredWorkspaceId) {
    const configured = await query(
      "SELECT id FROM workspaces WHERE id = $1 LIMIT 1",
      [configuredWorkspaceId],
    );
    if (configured.rows[0]?.id) {
      return configured.rows[0].id;
    }
  }

  const namedOffice = await query(
    "SELECT id FROM workspaces WHERE LOWER(name) = 'office workspace' ORDER BY created_at ASC LIMIT 1",
  );
  if (namedOffice.rows[0]?.id) {
    return namedOffice.rows[0].id;
  }

  const firstWorkspace = await query(
    "SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1",
  );
  return firstWorkspace.rows[0]?.id || null;
}

async function findPrimaryWorkspaceId(userId: string): Promise<string | null> {
  const pool = getDbPool();

  const defaultWorkspaceId = await findDefaultWorkspaceIdWithQuery((text, params) =>
    pool.query<{ id: string }>(text, params),
  );

  if (defaultWorkspaceId) {
    const preferred = await pool.query<{ workspace_id: string }>(
      `
      SELECT w.id AS workspace_id
      FROM workspaces w
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = w.id
       AND wm.user_id = $1
      WHERE w.id = $2
        AND (w.owner_id = $1 OR wm.user_id = $1)
      LIMIT 1
      `,
      [userId, defaultWorkspaceId],
    );

    if (preferred.rows[0]?.workspace_id) {
      return preferred.rows[0].workspace_id;
    }
  }

  const result = await pool.query<{
    workspace_id: string | null;
  }>(
    `
    SELECT COALESCE(owned.id, member.workspace_id) AS workspace_id
    FROM (SELECT $1::text AS user_id) me
    LEFT JOIN LATERAL (
      SELECT w.id
      FROM workspaces w
      WHERE w.owner_id = me.user_id
      ORDER BY w.created_at ASC
      LIMIT 1
    ) owned ON TRUE
    LEFT JOIN LATERAL (
      SELECT wm.workspace_id, wm.role
      FROM workspace_members wm
      WHERE wm.user_id = me.user_id
      ORDER BY
        CASE wm.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          ELSE 2
        END,
        wm.joined_at ASC
      LIMIT 1
    ) member ON TRUE
    `,
    [userId],
  );

  return result.rows[0]?.workspace_id || null;
}

export async function resolveAuthWorkspace(auth: AuthTokenPayload): Promise<AuthTokenPayload> {
  try {
    const workspaceId = await findPrimaryWorkspaceId(auth.userId);
    if (!workspaceId || workspaceId === auth.workspaceId) {
      return auth;
    }

    return {
      ...auth,
      workspaceId,
    };
  } catch {
    return auth;
  }
}

export function createRuntimeUserAccount(payload: {
  fullName: string;
  email: string;
  username: string;
  password: string;
}): { user?: AppUser; error?: string } {
  const fullName = payload.fullName.trim();
  const email = payload.email.trim().toLowerCase();
  const username = payload.username.trim().toLowerCase();

  if (!fullName || !email || !username || !payload.password) {
    return { error: "All fields are required." };
  }

  if (findByIdentifier(email) || findByIdentifier(username)) {
    return { error: "User with this email or username already exists." };
  }

  const record: AuthRecord = {
    id: `user-${randomUUID()}`,
    username,
    role: "participant",
    workspaceId: "workspace-acme",
    email,
    displayName: fullName,
    passwordHash: hashPassword(payload.password),
  };

  runtimeUsersByUsername.set(username, record);
  runtimeUsersByEmail.set(email, record);

  return { user: toAppUser(record) };
}

export async function createUserAccount(payload: {
  fullName: string;
  email: string;
  username: string;
  password: string;
}): Promise<{ user?: AppUser; error?: string }> {
  const fullName = payload.fullName.trim();
  const email = payload.email.trim().toLowerCase();
  const username = payload.username.trim().toLowerCase();

  if (!fullName || !email || !username || !payload.password) {
    return { error: "All fields are required." };
  }

  try {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `
        SELECT 1
        FROM users
        WHERE LOWER(email) = $1 OR LOWER(COALESCE(username, '')) = $2
        LIMIT 1
        `,
        [email, username],
      );

      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return { error: "User with this email or username already exists." };
      }

      const userId = `user-${randomUUID()}`;
      const workspaceId = `workspace-${randomUUID()}`;
      const workspaceName = `${fullName.split(" ")[0] || "Workspace"} Workspace`;
      const workspaceSlug = workspaceId;

      await client.query(
        `
        INSERT INTO users (id, name, email, password_hash, username, display_name)
        VALUES ($1, $2, $3, $4, $5, $2)
        `,
        [userId, fullName, email, hashPassword(payload.password), username],
      );

      await client.query(
        `
        INSERT INTO workspaces (id, name, owner_id, slug)
        VALUES ($1, $2, $3, $4)
        `,
        [workspaceId, workspaceName, userId, workspaceSlug],
      );

      await client.query(
        `
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (workspace_id, user_id) DO NOTHING
        `,
        [workspaceId, userId],
      );

      await client.query(
        `
        INSERT INTO subscriptions (id, workspace_id, plan_id, start_date, end_date, status)
        SELECT $1::uuid, $2, 'free', NOW(), NULL, 'active'
        WHERE EXISTS (SELECT 1 FROM plans WHERE id = 'free')
          AND NOT EXISTS (
            SELECT 1
            FROM subscriptions s
            WHERE s.workspace_id = $2
              AND s.status = 'active'
          )
        `,
        [randomUUID(), workspaceId],
      );

      await client.query("COMMIT");

      return {
        user: {
          id: userId,
          username,
          role: "host",
          workspaceId,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    // If DB write fails, still allow local testing with runtime account behavior.
    return createRuntimeUserAccount(payload);
  }
}

export function upsertGoogleRuntimeUser(payload: {
  email: string;
  name?: string;
}): AppUser {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const existing = findByIdentifier(normalizedEmail);

  if (existing) {
    return toAppUser(existing);
  }

  const safeBase = (payload.name || "googleuser")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const username = `${safeBase || "googleuser"}${Math.floor(Math.random() * 10000)}`;

  const record: AuthRecord = {
    id: `user-${randomUUID()}`,
    username,
    role: "participant",
    workspaceId: "workspace-acme",
    email: normalizedEmail,
    displayName: payload.name,
  };

  runtimeUsersByUsername.set(username, record);
  runtimeUsersByEmail.set(normalizedEmail, record);

  return toAppUser(record);
}

export async function upsertGoogleUserAccount(payload: {
  email: string;
  name?: string;
}): Promise<AppUser> {
  const normalizedEmail = payload.email.trim().toLowerCase();

  try {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query<{
        id: string;
        username: string | null;
        email: string;
      }>(
        `
        SELECT id, username, email
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
        `,
        [normalizedEmail],
      );

      let userId = existing.rows[0]?.id;
      let username = existing.rows[0]?.username || null;

      if (!userId) {
        userId = `user-${randomUUID()}`;

        const baseUsername = (payload.name || normalizedEmail.split("@")[0] || "googleuser")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 20) || "googleuser";

        let candidate = baseUsername;
        let suffix = 1;
        while (true) {
          const duplicate = await client.query<{ id: string }>(
            "SELECT id FROM users WHERE LOWER(COALESCE(username, '')) = $1 LIMIT 1",
            [candidate],
          );
          if (!duplicate.rows[0]) {
            username = candidate;
            break;
          }
          suffix += 1;
          candidate = `${baseUsername}${suffix}`.slice(0, 30);
        }

        await client.query(
          `
          INSERT INTO users (id, name, email, password_hash, username, display_name)
          VALUES ($1, $2, $3, $4, $5, $2)
          `,
          [
            userId,
            payload.name?.trim() || normalizedEmail.split("@")[0] || "Google User",
            normalizedEmail,
            hashPassword(randomUUID()),
            username,
          ],
        );
      }

      const workspace = await client.query<{
        workspace_id: string | null;
        app_role: UserRole;
      }>(
        `
        SELECT
          COALESCE(owned.id, member.workspace_id) AS workspace_id,
          CASE
            WHEN owned.id IS NOT NULL OR member.role IN ('owner', 'admin') THEN 'host'
            ELSE 'participant'
          END AS app_role
        FROM (SELECT $1::text AS user_id) me
        LEFT JOIN LATERAL (
          SELECT w.id
          FROM workspaces w
          WHERE w.owner_id = me.user_id
          ORDER BY w.created_at ASC
          LIMIT 1
        ) owned ON TRUE
        LEFT JOIN LATERAL (
          SELECT wm.workspace_id, wm.role
          FROM workspace_members wm
          WHERE wm.user_id = me.user_id
          ORDER BY
            CASE wm.role
              WHEN 'owner' THEN 0
              WHEN 'admin' THEN 1
              ELSE 2
            END,
            wm.joined_at ASC
          LIMIT 1
        ) member ON TRUE
        `,
        [userId],
      );

      let workspaceId = workspace.rows[0]?.workspace_id || null;
      let role: UserRole = workspace.rows[0]?.app_role || "participant";

      const defaultWorkspaceId = await findDefaultWorkspaceIdWithQuery((text, params) =>
        client.query<{ id: string }>(text, params),
      );

      if (defaultWorkspaceId) {
        await client.query<{
          owner_id: string;
        }>(
          `
          INSERT INTO workspace_members (workspace_id, user_id, role)
          SELECT $1, $2, 'member'
          FROM workspaces w
          WHERE w.id = $1
            AND w.owner_id <> $2
          ON CONFLICT (workspace_id, user_id) DO NOTHING
          `,
          [defaultWorkspaceId, userId],
        );

        const effectiveRole = await client.query<{
          app_role: UserRole;
        }>(
          `
          SELECT
            CASE
              WHEN w.owner_id = $1 OR wm.role IN ('owner', 'admin') THEN 'host'
              ELSE 'participant'
            END AS app_role
          FROM workspaces w
          LEFT JOIN workspace_members wm
            ON wm.workspace_id = w.id
           AND wm.user_id = $1
          WHERE w.id = $2
          LIMIT 1
          `,
          [userId, defaultWorkspaceId],
        );

        workspaceId = defaultWorkspaceId;
        role = effectiveRole.rows[0]?.app_role || "participant";
      }

      if (!workspaceId) {
        workspaceId = `workspace-${randomUUID()}`;
        const workspaceName = `${(payload.name?.trim() || "Google").split(" ")[0]} Workspace`;

        await client.query(
          `
          INSERT INTO workspaces (id, name, owner_id, slug)
          VALUES ($1, $2, $3, $4)
          `,
          [workspaceId, workspaceName, userId, workspaceId],
        );

        await client.query(
          `
          INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES ($1, $2, 'owner')
          ON CONFLICT (workspace_id, user_id) DO NOTHING
          `,
          [workspaceId, userId],
        );

        role = "host";
      }

      await client.query("COMMIT");

      return {
        id: userId,
        username: (username || normalizedEmail.split("@")[0] || "googleuser").toLowerCase(),
        role,
        workspaceId,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return upsertGoogleRuntimeUser(payload);
  }
}

export function createGoogleDemoUser(): AppUser {
  return upsertGoogleRuntimeUser({
    email: "google.user@officeconnect.demo",
    name: "Google User",
  });
}
