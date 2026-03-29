import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  createWorkspaceSecureMessage,
  listWorkspaceSecureMessages,
} from "@/src/lib/repositories/secureMessageRepository";
import {
  decryptSecureMessage,
  encryptSecureMessage,
  getSecureMessagingKey,
} from "@/src/lib/secureMessaging";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type SecureMessagesRouteParams = {
  params: Promise<{ workspaceId: string }>;
};

function secureMessagingUnavailableResponse() {
  return NextResponse.json(
    {
      error:
        "Secure messaging is unavailable. Configure SECURE_MESSAGING_KEY to enable encrypted dashboard chat.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request, { params }: SecureMessagesRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = getSecureMessagingKey();
  if (!key) {
    return secureMessagingUnavailableResponse();
  }

  const { workspaceId } = await params;
  const access = await getWorkspaceAccess(workspaceId, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || "80");
  const messages = await listWorkspaceSecureMessages(access.workspaceId, rawLimit);

  const safeMessages = messages.map((item) => {
    let text = "[Unable to decrypt message]";
    try {
      text = decryptSecureMessage({
        ciphertextB64: item.ciphertextB64,
        ivB64: item.ivB64,
        authTagB64: item.authTagB64,
        key,
      });
    } catch {
      // Keep placeholder text for unreadable records.
    }

    return {
      id: item.id,
      senderUserId: item.senderUserId,
      senderName: item.senderName,
      text,
      createdAt: item.createdAt,
      isMine: item.senderUserId === auth.userId,
    };
  });

  return NextResponse.json({
    workspaceId: access.workspaceId,
    messages: safeMessages,
  });
}

export async function POST(request: Request, { params }: SecureMessagesRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = getSecureMessagingKey();
  if (!key) {
    return secureMessagingUnavailableResponse();
  }

  const { workspaceId } = await params;
  const access = await getWorkspaceAccess(workspaceId, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const payload = (await request.json().catch(() => ({}))) as { text?: string };
  const text = payload.text?.trim() || "";
  if (!text) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Message is too long (max 2000 characters)" }, { status: 400 });
  }

  const encrypted = encryptSecureMessage(text, key);
  const inserted = await createWorkspaceSecureMessage({
    workspaceId: access.workspaceId,
    senderUserId: auth.userId,
    senderName: auth.username,
    ciphertextB64: encrypted.ciphertextB64,
    ivB64: encrypted.ivB64,
    authTagB64: encrypted.authTagB64,
  });

  return NextResponse.json(
    {
      message: {
        id: inserted.id,
        senderUserId: inserted.senderUserId,
        senderName: inserted.senderName,
        text,
        createdAt: inserted.createdAt,
        isMine: true,
      },
    },
    { status: 201 },
  );
}
