import { NextResponse } from "next/server";

import { generateMeetingSummary } from "@/src/lib/ai/meetingSummary";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";
import type { MeetingSummaryRequest } from "@/src/types/ai";

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const requestLimit = await checkRateLimit({
    scope: "ai-meeting-summary-requests",
    key: buildRateLimitKey([ip]),
    limit: Number(process.env.RATE_LIMIT_AI_SUMMARY_PER_10_MIN || "30"),
    windowMs: 10 * 60 * 1000,
  });

  if (!requestLimit.allowed) {
    const response = NextResponse.json({ error: "Too many summary requests. Please retry shortly." }, { status: 429 });
    response.headers.set("Retry-After", String(requestLimit.retryAfterSeconds));
    return response;
  }

  const payload = (await request.json()) as Partial<MeetingSummaryRequest>;
  const transcript = payload.transcript?.trim() || "";

  if (!transcript) {
    return NextResponse.json(
      {
        error: "Transcript text is required.",
      },
      { status: 400 },
    );
  }

  const charLimit = await checkRateLimit({
    scope: "ai-text-quota",
    key: buildRateLimitKey([ip]),
    limit: Number(process.env.RATE_LIMIT_AI_TEXT_CHARS_PER_10_MIN || "120000"),
    windowMs: 10 * 60 * 1000,
    weight: transcript.length,
  });

  if (!charLimit.allowed) {
    const response = NextResponse.json({ error: "AI text quota exceeded. Please retry shortly." }, { status: 429 });
    response.headers.set("Retry-After", String(charLimit.retryAfterSeconds));
    return response;
  }

  const result = await generateMeetingSummary(transcript);

  return NextResponse.json(result);
}
