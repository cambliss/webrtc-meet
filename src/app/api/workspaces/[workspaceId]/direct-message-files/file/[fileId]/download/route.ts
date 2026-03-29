import { cookies } from "next/headers";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { ensureDirectMessagingSchema } from "@/src/lib/directMessagingSchema";
import { readSecureSharedFileBytes } from "@/src/lib/objectStorage";
import {
  decryptSecureBinary,
  getCurrentSecureFileEncryptionVersion,
  getSecureFileEncryptionKeyByVersion,
  isSecureBinaryEnvelope,
} from "@/src/lib/secureMessaging";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type DirectMessageFileDownloadRouteContext = {
  params: Promise<{ workspaceId: string; fileId: string }>;
};

function quoteFileName(value: string): string {
  return (value || "file.bin").replace(/"/g, "");
}

export async function GET(
  _request: Request,
  { params }: DirectMessageFileDownloadRouteContext,
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

    const { workspaceId: rawWorkspaceId, fileId: rawFileId } = await params;
    const workspaceId = decodeURIComponent(rawWorkspaceId);
    const fileId = decodeURIComponent(rawFileId);
    const access = await getWorkspaceAccess(workspaceId, auth.userId);

    if (!access) {
      return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ensureDirectMessagingSchema();

    const pool = getDbPool();
    const fileResult = await pool.query<{
      id: string;
      storage_name: string;
      original_name: string;
      file_size: string;
      mime_type: string;
      is_encrypted: boolean;
      encryption_key_version: string | null;
      sender_user_id: string;
      recipient_user_id: string;
      is_read: boolean;
    }>(
      `
        SELECT 
          id,
          storage_name,
          original_name,
          file_size,
          mime_type,
          is_encrypted,
          encryption_key_version,
          sender_user_id,
          recipient_user_id,
          is_read
        FROM direct_message_files
        WHERE id = $1 AND workspace_id = $2
          AND (sender_user_id = $3 OR recipient_user_id = $3)
      `,
      [fileId, workspaceId, auth.userId]
    );

    if (fileResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: "File not found or not accessible" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const file = fileResult.rows[0];

    if (file.recipient_user_id === auth.userId && !file.is_read) {
      await pool.query(
        "UPDATE direct_message_files SET is_read = true WHERE id = $1",
        [fileId]
      );
    }

    const payload = await readSecureSharedFileBytes({
      workspaceId,
      storageName: file.storage_name,
    });

    let bytes = payload;
    const payloadIsEncrypted = file.is_encrypted || isSecureBinaryEnvelope(payload);
    if (payloadIsEncrypted) {
      const keyVersion = file.encryption_key_version || getCurrentSecureFileEncryptionVersion();
      const key = getSecureFileEncryptionKeyByVersion(keyVersion);
      if (!key) {
        return new Response(JSON.stringify({ error: "Secure file key not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        bytes = decryptSecureBinary(payload, key);
      } catch (decryptError) {
        console.error("Error decrypting direct message file:", decryptError);
        return new Response(JSON.stringify({ error: `Unable to decrypt file with key version ${keyVersion}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${quoteFileName(file.original_name)}"`,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error("Error downloading direct message file:", error);
    return new Response(
      JSON.stringify({ error: "Unable to download file" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
