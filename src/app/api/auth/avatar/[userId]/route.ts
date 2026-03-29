import { NextResponse } from "next/server";

import { resolveUserAvatarDownload } from "@/src/lib/objectStorage";
import { getDbPool } from "@/src/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const result = await pool.query<{ avatar_path: string | null }>(
      "SELECT avatar_path FROM users WHERE id = $1",
      [userId],
    );

    const avatarPath = result.rows[0]?.avatar_path;

    if (!avatarPath) {
      return NextResponse.json(
        { error: "Avatar not found" },
        { status: 404 },
      );
    }

    const downloadResult = await resolveUserAvatarDownload({
      storedPath: avatarPath,
    });

    if (downloadResult.kind === "redirect") {
      return NextResponse.redirect(downloadResult.url);
    }

    if (downloadResult.bytes.length === 0) {
      return NextResponse.json(
        { error: "Avatar file not found" },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(downloadResult.bytes), {
      headers: {
        "Content-Type": downloadResult.contentType,
        "Content-Disposition": downloadResult.contentDisposition,
      },
    });
  } catch (error) {
    console.error("Avatar download error:", error);
    return NextResponse.json(
      { error: "Failed to download avatar" },
      { status: 500 },
    );
  }
}
