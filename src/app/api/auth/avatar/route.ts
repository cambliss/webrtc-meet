import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { uploadUserAvatar, deleteUserAvatar } from "@/src/lib/objectStorage";
import { syncAvatarPresence } from "@/src/lib/signalingInternal";
import { trackAvatarEventServer } from "@/src/lib/avatarAnalytics";

export async function POST(request: Request) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 },
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    // Upload avatar
    const avatarPath = await uploadUserAvatar({
      userId: auth.userId,
      bytes,
      mimeType: file.type,
    });
    const avatarVersion = Date.now();

    // Update user record
    const pool = getDbPool();
    await pool.query(
      "UPDATE users SET avatar_path = $1 WHERE id = $2",
      [avatarPath, auth.userId],
    );

    try {
      await syncAvatarPresence({
        userId: auth.userId,
        avatarPath,
        avatarVersion,
      });
    } catch (syncError) {
      console.warn("Avatar presence sync warning:", syncError);
    }

    // Track avatar upload event
    try {
      await trackAvatarEventServer(auth.workspaceId, auth.userId, "avatar_upload", {
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (trackingError) {
      console.warn("Avatar event tracking warning:", trackingError);
    }

    return NextResponse.json({
      success: true,
      avatarPath,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete avatar from storage
    await deleteUserAvatar(auth.userId);

    // Clear avatar_path in database
    const pool = getDbPool();
    await pool.query(
      "UPDATE users SET avatar_path = NULL WHERE id = $1",
      [auth.userId],
    );

    try {
      await syncAvatarPresence({
        userId: auth.userId,
        avatarPath: null,
        avatarVersion: Date.now(),
      });
    } catch (syncError) {
      console.warn("Avatar presence sync warning:", syncError);
    }

    // Track avatar delete event
    try {
      await trackAvatarEventServer(auth.workspaceId, auth.userId, "avatar_delete");
    } catch (trackingError) {
      console.warn("Avatar event tracking warning:", trackingError);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Avatar delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete avatar" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = getDbPool();
    const result = await pool.query<{ avatar_path: string | null }>(
      "SELECT avatar_path FROM users WHERE id = $1",
      [auth.userId],
    );

    const avatarPath = result.rows[0]?.avatar_path || null;

    return NextResponse.json({
      avatarPath,
    });
  } catch (error) {
    console.error("Avatar get error:", error);
    return NextResponse.json(
      { error: "Failed to get avatar" },
      { status: 500 },
    );
  }
}
