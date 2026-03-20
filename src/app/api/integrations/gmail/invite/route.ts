import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/src/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/integrations/gmail/invite
 *
 * Sends a meeting invitation email.  Always returns a `mailtoUrl` the client
 * can use as a fallback (opens the user's local email client).  When a valid
 * google_calendar_token cookie exists it also dispatches the email via the
 * Gmail API so the invite is sent from the user's Google account.
 *
 * Body: { to: string | string[]; meetingLink: string; title?: string; message?: string }
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

  let body: { to?: string | string[]; meetingLink?: string; title?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, meetingLink, title = "You're invited to a video meeting", message } = body;
  if (!meetingLink) {
    return NextResponse.json({ error: "meetingLink is required" }, { status: 400 });
  }

  const recipients = Array.isArray(to) ? to : to ? [to] : [];
  const bodyText = message
    ? `${message}\n\nJoin here: ${meetingLink}`
    : `You have been invited to a video meeting.\n\nJoin here: ${meetingLink}`;

  const mailtoUrl = `mailto:${recipients.join(",")}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(bodyText)}`;

  // Opportunistic: send via Gmail API when token available and recipients are provided.
  const gcToken = cookieStore.get("google_calendar_token")?.value;
  let gmailSent = false;
  if (gcToken && recipients.length > 0) {
    try {
      const rawEmail = [
        `To: ${recipients.join(", ")}`,
        `Subject: =?utf-8?B?${Buffer.from(title).toString("base64")}?=`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        bodyText,
      ].join("\r\n");

      const encoded = Buffer.from(rawEmail)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gcToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      });

      gmailSent = gmailRes.ok;
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ mailtoUrl, gmailSent });
}
