import type { MeetingSummaryResult } from "@/src/types/ai";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_SUMMARY_MODEL || "claude-3-5-sonnet-latest";

function resolveSummaryProvider(): "openai" | "anthropic" {
  const configured = (process.env.AI_SUMMARY_PROVIDER || "").trim().toLowerCase();
  if (configured === "openai" || configured === "anthropic") {
    return configured;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }

  return "openai";
}

function fallbackSummary(transcript: string): MeetingSummaryResult {
  const lines = transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    summary:
      "AI summary fallback: transcript was received but model output was unavailable. See key points for extracted lines.",
    keyPoints: lines.length > 0 ? lines : ["No clear key points found in transcript."],
    actionItems: [],
  };
}

function stripMarkdownCodeFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeSummaryShape(value: unknown): MeetingSummaryResult {
  if (!value || typeof value !== "object") {
    throw new Error("Model returned invalid summary payload");
  }

  const payload = value as {
    summary?: unknown;
    keyPoints?: unknown;
    actionItems?: unknown;
  };

  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const keyPoints = Array.isArray(payload.keyPoints)
    ? payload.keyPoints.filter((item): item is string => typeof item === "string")
    : [];
  const actionItems = Array.isArray(payload.actionItems)
    ? payload.actionItems.filter((item): item is string => typeof item === "string")
    : [];

  return {
    summary: summary || "No concise summary could be generated.",
    keyPoints,
    actionItems,
  };
}

export async function generateMeetingSummary(transcript: string): Promise<MeetingSummaryResult> {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    return {
      summary: "Transcript is empty.",
      keyPoints: [],
      actionItems: [],
    };
  }

  const provider = resolveSummaryProvider();

  if (provider === "anthropic") {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return fallbackSummary(trimmedTranscript);
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1200,
          temperature: 0.2,
          system:
            "You are a meeting assistant. Return only JSON with keys: summary (string), keyPoints (string[]), actionItems (string[]).",
          messages: [
            {
              role: "user",
              content: `Create a concise meeting report from this transcript:\n\n${trimmedTranscript}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        return fallbackSummary(trimmedTranscript);
      }

      const completion = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };

      const content = completion.content?.find((item) => item?.type === "text")?.text;
      if (!content) {
        return fallbackSummary(trimmedTranscript);
      }

      const parsed = JSON.parse(stripMarkdownCodeFence(content));
      return normalizeSummaryShape(parsed);
    } catch {
      return fallbackSummary(trimmedTranscript);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackSummary(trimmedTranscript);
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a meeting assistant. Return only JSON with keys: summary (string), keyPoints (string[]), actionItems (string[]).",
          },
          {
            role: "user",
            content: `Create a concise meeting report from this transcript:\n\n${trimmedTranscript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallbackSummary(trimmedTranscript);
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackSummary(trimmedTranscript);
    }

    const parsed = JSON.parse(stripMarkdownCodeFence(content));
    return normalizeSummaryShape(parsed);
  } catch {
    return fallbackSummary(trimmedTranscript);
  }
}
