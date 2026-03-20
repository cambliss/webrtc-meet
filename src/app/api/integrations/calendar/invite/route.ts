import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/src/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/integrations/calendar/invite
 *
 * Creates a Google Calendar deep-link (no OAuth required) that users can
 * click to add the meeting to their own calendar.  When a valid
 * google_calendar_token cookie is present the endpoint also tries to create
 * the event server-side via the Google Calendar REST API.
 *
 * Body: { meetingLink: string; title?: string; startIso?: string; endIso?: string }
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("meeting_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await verifyAuthToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { meetingLink?: string; title?: string; startIso?: string; endIso?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { meetingLink, title = "Video Meeting", startIso, endIso } = body;
  if (!meetingLink) {
    return NextResponse.json({ error: "meetingLink is required" }, { status: 400 });
  }

  /** Format an ISO date string to the yyyyMMdd'T'HHmmss'Z' format Google expects */
  const toGCalDate = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const calendarUrl = new URL("https://calendar.google.com/calendar/render");
  calendarUrl.searchParams.set("action", "TEMPLATE");
  calendarUrl.searchParams.set("text", title);
  calendarUrl.searchParams.set("details", `Join the meeting: ${meetingLink}`);
  if (startIso && endIso) {
    calendarUrl.searchParams.set("dates", `${toGCalDate(startIso)}/${toGCalDate(endIso)}`);
  }
  calendarUrl.searchParams.set("sprop", "website:" + meetingLink);

  // Opportunistic: if a Google Calendar access token is stored, create the event server-side.
  const gcToken = cookieStore.get("google_calendar_token")?.value;
  let serverEventUrl: string | null = null;
  if (gcToken) {
    try {
      const nowMs = Date.now();
      const startMs = startIso ? new Date(startIso).getTime() : nowMs;
      const endMs = endIso ? new Date(endIso).getTime() : startMs + 60 * 60 * 1000;

      const evRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gcToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            description: `Join the meeting: ${meetingLink}`,
            start: { dateTime: new Date(startMs).toISOString() },
            end: { dateTime: new Date(endMs).toISOString() },
          }),
        },
      );

      if (evRes.ok) {
        const evData = (await evRes.json()) as { htmlLink?: string };
        serverEventUrl = evData.htmlLink ?? null;
      }
    } catch {
      // Non-fatal — fall through to deeplink
    }
  }

  return NextResponse.json({
    calendarDeeplink: calendarUrl.toString(),
    serverEventUrl,
  });
}
