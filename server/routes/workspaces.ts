import { randomUUID } from "node:crypto";

import { parse as parseCookie } from "cookie";
import { type NextFunction, type Request, type Response, Router } from "express";

import { verifyAuthToken, type AuthTokenPayload } from "../../src/lib/auth";
import { getDbPool } from "../../src/lib/db";
import { sendWorkspaceInviteEmail } from "../lib/email";

type AuthedRequest = Request & {
  auth: AuthTokenPayload;
};

type WorkspaceRole = "owner" | "admin" | "member";

const workspaceRouter = Router();

function getSingleRouteParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0 && value[0].trim()) {
    return value[0];
  }

  return null;
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookie(cookieHeader);
  return cookies.meeting_token ?? null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as AuthedRequest).auth = auth;
  next();
}

async function getWorkspaceRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const pool = getDbPool();
  const result = await pool.query<{ role: WorkspaceRole }>(
    `
      SELECT
        CASE
          WHEN w.owner_id = $2 THEN 'owner'
          ELSE wm.role
        END AS role
      FROM workspaces w
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = w.id
       AND wm.user_id = $2
      WHERE w.id = $1
        AND (w.owner_id = $2 OR wm.user_id = $2)
      LIMIT 1
    `,
    [workspaceId, userId],
  );

  return result.rows[0]?.role ?? null;
}

workspaceRouter.post("/workspaces", requireAuth, async (req, res) => {
  const { name } = req.body as { name?: string };

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Workspace name is required" });
    return;
  }

  const workspaceId = `workspace-${randomUUID()}`;
  const workspaceName = name.trim();
  const ownerId = (req as AuthedRequest).auth.userId;

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO workspaces (id, name, owner_id)
        VALUES ($1, $2, $3)
      `,
      [workspaceId, workspaceName, ownerId],
    );

    await client.query(
      `
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner')
      `,
      [workspaceId, ownerId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create workspace", error);
    res.status(500).json({ error: "Failed to create workspace" });
    return;
  } finally {
    client.release();
  }

  res.status(201).json({
    workspace: {
      id: workspaceId,
      name: workspaceName,
      ownerId,
      role: "owner",
    },
  });
});

workspaceRouter.get("/workspaces", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).auth.userId;
  const pool = getDbPool();

  try {
    const result = await pool.query<{
      id: string;
      name: string;
      owner_id: string;
      created_at: string;
      role: WorkspaceRole;
    }>(
      `
        SELECT
          w.id,
          w.name,
          w.owner_id,
          w.created_at,
          CASE WHEN w.owner_id = $1 THEN 'owner' ELSE wm.role END AS role
        FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = $1
        ORDER BY w.created_at DESC
      `,
      [userId],
    );

    res.json({
      workspaces: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        role: row.role,
      })),
    });
  } catch (error) {
    console.error("Failed to list workspaces", error);
    res.status(500).json({ error: "Failed to list workspaces" });
  }
});

workspaceRouter.post("/workspaces/:id/invite", requireAuth, async (req, res) => {
  const workspaceId = getSingleRouteParam(req.params.id);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace id is required" });
    return;
  }

  const inviterId = (req as AuthedRequest).auth.userId;
  const { email, role } = req.body as { email?: string; role?: "admin" | "member" };

  if (!email || !email.trim()) {
    res.status(400).json({ error: "Invitee email is required" });
    return;
  }

  const memberRole = role ?? "member";
  if (memberRole !== "admin" && memberRole !== "member") {
    res.status(400).json({ error: "Role must be either 'admin' or 'member'" });
    return;
  }

  const inviterRole = await getWorkspaceRole(workspaceId, inviterId);
  if (!inviterRole) {
    res.status(403).json({ error: "You are not a member of this workspace" });
    return;
  }

  if (inviterRole !== "owner" && inviterRole !== "admin") {
    res.status(403).json({ error: "Only workspace owner or admins can invite members" });
    return;
  }

  const pool = getDbPool();

  try {
    const workspaceResult = await pool.query<{ name: string }>(
      `
        SELECT name
        FROM workspaces
        WHERE id = $1
        LIMIT 1
      `,
      [workspaceId],
    );

    const workspace = workspaceResult.rows[0];
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const inviteToken = randomUUID();
    const baseAppUrl = process.env.APP_URL || process.env.CLIENT_ORIGIN || "http://localhost:3000";
    const inviteLink = `${baseAppUrl}/signup?invite=${encodeURIComponent(inviteToken)}`;

    await pool.query(
      `
        INSERT INTO workspace_invites (token, workspace_id, email, role, invited_by, expires_at)
        VALUES ($1, $2, lower($3), $4, $5, NOW() + INTERVAL '7 days')
      `,
      [inviteToken, workspaceId, email.trim(), memberRole, inviterId],
    );

    const emailResult = await sendWorkspaceInviteEmail({
      toEmail: email.trim(),
      workspaceName: workspace.name,
      inviterName: (req as AuthedRequest).auth.username,
      inviteLink,
    });

    res.status(200).json({
      invite: {
        token: inviteToken,
        workspaceId,
        email: email.trim(),
        role: memberRole,
        inviteLink,
        expiresInDays: 7,
        emailDelivery: {
          delivered: emailResult.delivered,
          provider: emailResult.provider,
        },
      },
    });
  } catch (error) {
    console.error("Failed to invite workspace member", error);
    res.status(500).json({ error: "Failed to invite workspace member" });
  }
});

workspaceRouter.get("/workspaces/:id/members", requireAuth, async (req, res) => {
  const workspaceId = getSingleRouteParam(req.params.id);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace id is required" });
    return;
  }

  const userId = (req as AuthedRequest).auth.userId;

  const membershipRole = await getWorkspaceRole(workspaceId, userId);
  if (!membershipRole) {
    res.status(403).json({ error: "You are not a member of this workspace" });
    return;
  }

  if (membershipRole !== "owner" && membershipRole !== "admin") {
    res.status(403).json({ error: "Only workspace owner or admins can manage members" });
    return;
  }

  const pool = getDbPool();

  try {
    const result = await pool.query<{
      user_id: string;
      role: WorkspaceRole;
      joined_at: string;
      name: string;
      email: string;
    }>(
      `
        SELECT wm.user_id, wm.role, wm.joined_at, u.name, u.email
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
        ORDER BY wm.joined_at ASC
      `,
      [workspaceId],
    );

    res.json({
      workspaceId,
      members: result.rows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        joinedAt: row.joined_at,
      })),
    });
  } catch (error) {
    console.error("Failed to list workspace members", error);
    res.status(500).json({ error: "Failed to list workspace members" });
  }
});

export { workspaceRouter };
