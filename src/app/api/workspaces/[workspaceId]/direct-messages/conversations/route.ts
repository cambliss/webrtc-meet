import { cookies } from "next/headers";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { ensureDirectMessagingSchema } from "@/src/lib/directMessagingSchema";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type DirectMessageConversationsRouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(
  _request: Request,
  { params }: DirectMessageConversationsRouteContext,
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("meeting_token")?.value;
    const auth = token ? verifyAuthToken(token) : null;

    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { workspaceId: rawWorkspaceId } = await params;
    const workspaceId = decodeURIComponent(rawWorkspaceId);
    const access = await getWorkspaceAccess(workspaceId, auth.userId);

    if (!access) {
      return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ensureDirectMessagingSchema();

    const pool = getDbPool();
    const result = await pool.query<{
      id: string;
      name: string;
      email: string;
      display_name: string | null;
      avatar_path: string | null;
      last_msg_time: string | null;
      last_file_time: string | null;
      unread_count: string;
    }>(
      `
        SELECT *
        FROM (
          SELECT
            u.id,
            u.name,
            u.email,
            u.display_name,
            u.avatar_path,
            (SELECT MAX(created_at) FROM direct_messages
             WHERE workspace_id = $1
             AND ((sender_user_id = $2 AND recipient_user_id = u.id)
               OR (sender_user_id = u.id AND recipient_user_id = $2))
            ) AS last_msg_time,
            (SELECT MAX(created_at) FROM direct_message_files
             WHERE workspace_id = $1
             AND ((sender_user_id = $2 AND recipient_user_id = u.id)
               OR (sender_user_id = u.id AND recipient_user_id = $2))
            ) AS last_file_time,
            (SELECT COUNT(*) FROM direct_messages
             WHERE workspace_id = $1
             AND recipient_user_id = $2
             AND sender_user_id = u.id
             AND is_read = false
            ) AS unread_count
          FROM users u
          WHERE u.id != $2
            AND (
              EXISTS(SELECT 1 FROM direct_messages WHERE workspace_id = $1 AND ((sender_user_id = $2 AND recipient_user_id = u.id) OR (sender_user_id = u.id AND recipient_user_id = $2)))
              OR EXISTS(SELECT 1 FROM direct_message_files WHERE workspace_id = $1 AND ((sender_user_id = $2 AND recipient_user_id = u.id) OR (sender_user_id = u.id AND recipient_user_id = $2)))
            )
        ) AS conversations
        ORDER BY GREATEST(
          COALESCE(conversations.last_msg_time, to_timestamp(0)),
          COALESCE(conversations.last_file_time, to_timestamp(0))
        ) DESC
        LIMIT 50
      `,
      [workspaceId, auth.userId]
    );

    const conversations = result.rows.map((row) => ({
      userId: row.id,
      userName: row.name,
      userEmail: row.email,
      userDisplayName: row.display_name,
      userAvatarPath: row.avatar_path,
      lastActivityAt: row.last_msg_time || row.last_file_time,
      unreadCount: parseInt(row.unread_count, 10),
    }));

    return new Response(JSON.stringify({ conversations }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return new Response(
      JSON.stringify({ error: "Unable to fetch conversations" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
