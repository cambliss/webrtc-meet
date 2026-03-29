import { cookies } from "next/headers";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { ensureDirectMessagingSchema } from "@/src/lib/directMessagingSchema";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";
import { v4 as uuidv4 } from "uuid";

type DirectMessagesRouteContext = {
  params: Promise<{ workspaceId: string; userId: string }>;
};

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.SECURE_MESSAGING_KEY;
  if (!key) {
    throw new Error("SECURE_MESSAGING_KEY not configured");
  }
  // SHA-256 hash of the key to ensure consistent length
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(key).digest();
}

function encryptMessage(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

function decryptMessage(
  ciphertext: string,
  iv: string,
  authTag: string
): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");
  return plaintext;
}

// GET - Fetch messages with a specific user
export async function GET(
  _request: Request,
  { params }: DirectMessagesRouteContext,
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

    const { workspaceId: rawWorkspaceId, userId: rawUserId } = await params;
    const workspaceId = decodeURIComponent(rawWorkspaceId);
    const otherUserId = decodeURIComponent(rawUserId);
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
      sender_user_id: string;
      recipient_user_id: string;
      sender_name: string;
      ciphertext_b64: string;
      iv_b64: string;
      auth_tag_b64: string;
      is_read: boolean;
      created_at: string;
    }>(
      `
        SELECT 
          id,
          sender_user_id,
          recipient_user_id,
          sender_name,
          ciphertext_b64,
          iv_b64,
          auth_tag_b64,
          is_read,
          created_at
        FROM direct_messages
        WHERE workspace_id = $1
          AND ((sender_user_id = $2 AND recipient_user_id = $3)
            OR (sender_user_id = $3 AND recipient_user_id = $2))
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [workspaceId, auth.userId, otherUserId]
    );

    await pool.query(
      `
        UPDATE direct_messages
        SET is_read = true
        WHERE workspace_id = $1
          AND recipient_user_id = $2
          AND sender_user_id = $3
          AND is_read = false
      `,
      [workspaceId, auth.userId, otherUserId]
    );

    const messages = result.rows.reverse().map((row) => {
      try {
        const text = decryptMessage(row.ciphertext_b64, row.iv_b64, row.auth_tag_b64);
        return {
          id: row.id,
          senderUserId: row.sender_user_id,
          recipientUserId: row.recipient_user_id,
          senderName: row.sender_name,
          text,
          isRead: row.is_read,
          isMine: row.sender_user_id === auth.userId,
          createdAt: row.created_at,
        };
      } catch (error) {
        console.error("Failed to decrypt message:", error);
        return {
          id: row.id,
          senderUserId: row.sender_user_id,
          recipientUserId: row.recipient_user_id,
          senderName: row.sender_name,
          text: "[Decryption failed]",
          isRead: row.is_read,
          isMine: row.sender_user_id === auth.userId,
          createdAt: row.created_at,
        };
      }
    });

    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching direct messages:", error);
    return new Response(
      JSON.stringify({ error: "Unable to fetch messages" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// POST - Send a direct message
export async function POST(
  request: Request,
  { params }: DirectMessagesRouteContext,
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

    const { workspaceId: rawWorkspaceId, userId: rawUserId } = await params;
    const workspaceId = decodeURIComponent(rawWorkspaceId);
    const recipientUserId = decodeURIComponent(rawUserId);
    const access = await getWorkspaceAccess(workspaceId, auth.userId);

    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();

    if (!text) {
      return new Response(JSON.stringify({ error: "Message text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!access) {
      return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ensureDirectMessagingSchema();

    const pool = getDbPool();
    const recipientAccess = await getWorkspaceAccess(workspaceId, recipientUserId);

    if (!recipientAccess) {
      return new Response(JSON.stringify({ error: "Recipient not found in this workspace" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const recipientCheck = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1 LIMIT 1",
      [recipientUserId]
    );

    if (recipientCheck.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Recipient not found in this workspace" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const senderName = auth.username || auth.userId;
    const { ciphertext: ciphertext_b64, iv: iv_b64, authTag: auth_tag_b64 } = encryptMessage(text);
    const messageId = uuidv4();

    // Insert message
    await pool.query(
      `
        INSERT INTO direct_messages 
        (id, workspace_id, sender_user_id, recipient_user_id, sender_name, ciphertext_b64, iv_b64, auth_tag_b64, is_read)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
      `,
      [messageId, workspaceId, auth.userId, recipientUserId, senderName, ciphertext_b64, iv_b64, auth_tag_b64]
    );

    return new Response(
      JSON.stringify({
        message: {
          id: messageId,
          senderUserId: auth.userId,
          senderName,
          recipientUserId,
          text,
          isRead: false,
          isMine: true,
          createdAt: new Date().toISOString(),
        },
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending direct message:", error);
    return new Response(
      JSON.stringify({ error: "Unable to send message" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
