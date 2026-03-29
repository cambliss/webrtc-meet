import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const auth = token ? verifyAuthToken(token) : null;

    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { eventType, metadata } = body as {
      eventType: "avatar_upload" | "avatar_delete" | "avatar_view";
      metadata?: Record<string, unknown>;
    };

    if (!eventType || !["avatar_upload", "avatar_delete", "avatar_view"].includes(eventType)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    const pool = getDbPool();

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS avatar_events (
        id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT avatar_events_event_type_check 
          CHECK (event_type IN ('avatar_upload', 'avatar_delete', 'avatar_view'))
      );
      CREATE INDEX IF NOT EXISTS avatar_events_workspace_created_idx 
        ON avatar_events(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS avatar_events_user_created_idx 
        ON avatar_events(user_id, created_at DESC);
    `);

    // Insert event
    await pool.query(
      `
      INSERT INTO avatar_events (id, workspace_id, user_id, event_type, metadata)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [uuidv4(), auth.workspaceId, auth.userId, eventType, JSON.stringify(metadata || {})],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avatar event tracking error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get analytics summary
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const auth = token ? verifyAuthToken(token) : null;

    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getDbPool();

    // Get avatar event stats for the workspace
    const result = await pool.query<{
      event_type: string;
      count: string;
      unique_users: string;
      last_event: string;
    }>(
      `
      SELECT 
        event_type,
        COUNT(*)::text as count,
        COUNT(DISTINCT user_id)::text as unique_users,
        MAX(created_at)::text as last_event
      FROM avatar_events
      WHERE workspace_id = $1
      GROUP BY event_type
      ORDER BY event_type
      `,
      [auth.workspaceId],
    );

    const stats = {
      uploads: { count: 0, uniqueUsers: 0, lastEvent: null as string | null },
      deletes: { count: 0, uniqueUsers: 0, lastEvent: null as string | null },
      views: { count: 0, uniqueUsers: 0, lastEvent: null as string | null },
    };

    for (const row of result.rows) {
      const key = row.event_type === "avatar_upload" ? "uploads" : row.event_type === "avatar_delete" ? "deletes" : "views";
      stats[key] = {
        count: Number(row.count),
        uniqueUsers: Number(row.unique_users),
        lastEvent: row.last_event,
      };
    }

    // Get user adoption rate
    const adoptionResult = await pool.query<{ adoption_rate: string; users_with_avatar: string }>(
      `
      SELECT 
        (COUNT(DISTINCT ae.user_id)::float / COUNT(DISTINCT wm.user_id) * 100)::text as adoption_rate,
        COUNT(DISTINCT ae.user_id)::text as users_with_avatar
      FROM avatar_events ae
      FULL OUTER JOIN workspace_members wm ON wm.workspace_id = ae.workspace_id
      WHERE ae.workspace_id = $1 AND ae.event_type = 'avatar_upload'
      `,
      [auth.workspaceId],
    );

    const adoptionData = adoptionResult.rows[0];

    return NextResponse.json({
      stats,
      adoption: {
        rate: adoptionData ? parseFloat(adoptionData.adoption_rate || "0") : 0,
        usersWithAvatar: adoptionData ? Number(adoptionData.users_with_avatar || 0) : 0,
      },
    });
  } catch (error) {
    console.error("Avatar analytics fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
