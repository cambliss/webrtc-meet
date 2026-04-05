import { NextResponse } from "next/server";

import { synthesizeTranslatedSpeech } from "@/src/lib/ai/speech";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/src/lib/rateLimit";

type SpeechRequest = {
  text?: string;
  targetLanguage?: string;
};

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const requestLimit = await checkRateLimit({
    scope: "ai-speech-requests",
    key: buildRateLimitKey([ip]),
    limit: Number(process.env.RATE_LIMIT_AI_SPEECH_PER_10_MIN || "80"),
    windowMs: 10 * 60 * 1000,
  });

  if (!requestLimit.allowed) {
    const response = NextResponse.json({ error: "Too many speech requests. Please retry shortly." }, { status: 429 });
    response.headers.set("Retry-After", String(requestLimit.retryAfterSeconds));
    return response;
  }

  const payload = (await request.json().catch(() => ({}))) as SpeechRequest;
  const text = payload.text?.trim() || "";
  const targetLanguage = payload.targetLanguage?.trim() || "";

  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  if (!targetLanguage) {
    return NextResponse.json({ error: "Target language is required." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    // No server TTS key: let clients fall back to browser speech synthesis.
    return NextResponse.json({ audioBase64: null, mimeType: null, fallback: "browser" });
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

  const synthesized = await synthesizeTranslatedSpeech({ text, targetLanguage });
  if (!synthesized) {
    return NextResponse.json({ error: "Server speech synthesis unavailable." }, { status: 503 });
  }

  return NextResponse.json(synthesized);
}
