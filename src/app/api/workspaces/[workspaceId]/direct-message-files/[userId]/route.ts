import { cookies } from "next/headers";

import path from "node:path";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { ensureDirectMessagingSchema } from "@/src/lib/directMessagingSchema";
import { v4 as uuidv4 } from "uuid";
import { uploadSecureSharedFile } from "@/src/lib/objectStorage";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";
import { encryptSecureBinary, getCurrentSecureFileEncryptionKey } from "@/src/lib/secureMessaging";

type DirectMessageFilesRouteContext = {
  params: Promise<{ workspaceId: string; userId: string }>;
};

function safeFileName(fileName: string): string {
  return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file.bin";
}

export async function GET(
  _request: Request,
  { params }: DirectMessageFilesRouteContext,
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
      original_name: string;
      file_size: string;
      mime_type: string;
      is_encrypted: boolean;
      encryption_key_version: string | null;
      is_read: boolean;
      created_at: string;
    }>(
      `
        SELECT
          id,
          sender_user_id,
          recipient_user_id,
          sender_name,
          original_name,
          file_size::text,
          mime_type,
          is_encrypted,
          encryption_key_version,
          is_read,
          created_at
        FROM direct_message_files
        WHERE workspace_id = $1
          AND ((sender_user_id = $2 AND recipient_user_id = $3)
            OR (sender_user_id = $3 AND recipient_user_id = $2))
        ORDER BY created_at ASC
      `,
      [workspaceId, auth.userId, otherUserId],
    );

    await pool.query(
      `
        UPDATE direct_message_files
        SET is_read = true
        WHERE workspace_id = $1
          AND recipient_user_id = $2
          AND sender_user_id = $3
          AND is_read = false
      `,
      [workspaceId, auth.userId, otherUserId],
    );

    return new Response(
      JSON.stringify({
        files: result.rows.map((row) => ({
          id: row.id,
          senderUserId: row.sender_user_id,
          recipientUserId: row.recipient_user_id,
          senderName: row.sender_name,
          originalName: row.original_name,
          fileSize: Number(row.file_size),
          mimeType: row.mime_type,
          isEncrypted: row.is_encrypted,
          encryptionKeyVersion: row.encryption_key_version,
          isRead: row.is_read,
          isMine: row.sender_user_id === auth.userId,
          createdAt: row.created_at,
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching direct message files:", error);
    return new Response(JSON.stringify({ error: "Unable to fetch files" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(
  request: Request,
  { params }: DirectMessageFilesRouteContext,
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

    if (!access) {
      return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ensureDirectMessagingSchema();

    const pool = getDbPool();
    const recipientCheck = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1 LIMIT 1",
      [recipientUserId],
    );

    if (recipientCheck.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Recipient not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "File is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Limit file size to 100MB
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: "File size exceeds 100MB limit" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fileId = uuidv4();
    const storageName = `dm-${auth.userId}-${fileId}-${safeFileName(file.name)}`;
    const currentFileKey = getCurrentSecureFileEncryptionKey();
    if (!currentFileKey) {
      return new Response(JSON.stringify({ error: "Secure messaging key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const buffer = await file.arrayBuffer();
    const encryptedPayload = encryptSecureBinary(Buffer.from(buffer), currentFileKey.key);

    await uploadSecureSharedFile({
      workspaceId,
      storageName,
      bytes: encryptedPayload,
      mimeType: "application/octet-stream",
    });

    await pool.query(
      `
        INSERT INTO direct_message_files
        (id, workspace_id, sender_user_id, recipient_user_id, sender_name, original_name, storage_name, file_size, mime_type, is_encrypted, encryption_key_version, is_read)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, false)
      `,
      [
        fileId,
        workspaceId,
        auth.userId,
        recipientUserId,
        auth.username || auth.userId,
        file.name,
        storageName,
        file.size,
        file.type || "application/octet-stream",
        currentFileKey.version,
      ]
    );

    return new Response(
      JSON.stringify({
        file: {
          id: fileId,
          senderUserId: auth.userId,
          senderName: auth.username || auth.userId,
          recipientUserId,
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
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
    console.error("Error uploading direct message file:", error);
    return new Response(
      JSON.stringify({ error: "Unable to upload file" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
