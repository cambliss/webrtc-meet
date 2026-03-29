import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyAuthToken } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("meeting_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await verifyAuthToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ disconnected: true });
  response.cookies.set("google_calendar_token", "", { maxAge: 0, path: "/" });
  response.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/" });
  response.cookies.set("google_oauth_next", "", { maxAge: 0, path: "/" });
  return response;
}
