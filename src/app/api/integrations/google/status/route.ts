import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyAuthToken } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("meeting_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await verifyAuthToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = cookieStore.get("google_calendar_token")?.value;

  return NextResponse.json({
    connected: Boolean(accessToken),
    scopes: accessToken ? ["calendar.events", "gmail.send"] : [],
  });
}
