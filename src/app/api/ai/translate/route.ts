import { NextResponse } from "next/server";

import { translateMeetingText } from "@/src/lib/ai/translation";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";

type TranslateRequest = {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Translation is not configured on the server. Set OPENAI_API_KEY or ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const ip = getRequestIp(request);
  const requestLimit = await checkRateLimit({
    scope: "ai-translate-requests",
    key: buildRateLimitKey([ip]),
    limit: Number(process.env.RATE_LIMIT_AI_TRANSLATE_PER_10_MIN || "120"),
    windowMs: 10 * 60 * 1000,
  });

  if (!requestLimit.allowed) {
    const response = NextResponse.json({ error: "Too many translation requests. Please retry shortly." }, { status: 429 });
    response.headers.set("Retry-After", String(requestLimit.retryAfterSeconds));
    return response;
  }

  const payload = (await request.json()) as Partial<TranslateRequest>;
  const text = payload.text?.trim() || "";
  const targetLanguage = payload.targetLanguage?.trim() || "";

  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  if (!targetLanguage) {
    return NextResponse.json({ error: "Target language is required." }, { status: 400 });
  }

  const charLimit = await checkRateLimit({
    scope: "ai-text-quota",
    key: buildRateLimitKey([ip]),
    limit: Number(process.env.RATE_LIMIT_AI_TEXT_CHARS_PER_10_MIN || "120000"),
    windowMs: 10 * 60 * 1000,
    weight: text.length,
  });

  if (!charLimit.allowed) {
    const response = NextResponse.json({ error: "AI text quota exceeded. Please retry shortly." }, { status: 429 });
    response.headers.set("Retry-After", String(charLimit.retryAfterSeconds));
    return response;
  }

  const result = await translateMeetingText({
    text,
    targetLanguage,
    sourceLanguage: payload.sourceLanguage,
  });

  return NextResponse.json(result);
}
