import { getDbPool } from "@/src/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * Client-side utility to track avatar events (from client components)
 */
export async function trackAvatarEvent(
  eventType: "avatar_upload" | "avatar_delete" | "avatar_view",
  metadata?: Record<string, unknown>,
) {
  try {
    const response = await fetch("/api/analytics/avatar-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType,
        metadata,
      }),
    });

    if (!response.ok) {
      console.warn("Failed to track avatar event:", eventType);
    }
  } catch (error) {
    console.warn("Error tracking avatar event:", error);
  }
}

/**
 * Server-side utility to track avatar events directly to database
 * Used from API routes that already have auth context
 */
export async function trackAvatarEventServer(
  workspaceId: string,
  userId: string,
  eventType: "avatar_upload" | "avatar_delete" | "avatar_view",
  metadata?: Record<string, unknown>,
) {
  try {
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
      [uuidv4(), workspaceId, userId, eventType, JSON.stringify(metadata || {})],
    );
  } catch (error) {
    console.warn("Error tracking avatar event (server):", error);
    // Silently fail - analytics should never break the app
  }
}
