const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || "gpt-4o-mini";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_TRANSLATION_MODEL = process.env.ANTHROPIC_TRANSLATION_MODEL || "claude-3-5-sonnet-latest";

type TranslationResult = {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
};

function normalizeTranslationShape(value: unknown, fallbackTarget: string): TranslationResult {
  if (!value || typeof value !== "object") {
    throw new Error("Model returned invalid translation payload");
  }

  const payload = value as {
    translatedText?: unknown;
    sourceLanguage?: unknown;
    targetLanguage?: unknown;
  };

  const translatedText = typeof payload.translatedText === "string" ? payload.translatedText.trim() : "";
  const sourceLanguage = typeof payload.sourceLanguage === "string" ? payload.sourceLanguage.trim() : "auto";
  const targetLanguage = typeof payload.targetLanguage === "string" ? payload.targetLanguage.trim() : fallbackTarget;

  if (!translatedText) {
    throw new Error("Translated text is empty");
  }

  return {
    translatedText,
    sourceLanguage,
    targetLanguage,
  };
}

function parseTranslationResponseText(content: string, fallbackTarget: string): TranslationResult {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Model returned empty content");
  }

  // Prefer strict JSON payload, but tolerate wrappers like markdown code fences.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return normalizeTranslationShape(JSON.parse(jsonCandidate), fallbackTarget);
    } catch {
      // Fall back to plain text handling below.
    }
  }

  return {
    translatedText: trimmed,
    sourceLanguage: "auto",
    targetLanguage: fallbackTarget,
  };
}

function resolveTranslationProvider(): "openai" | "anthropic" {
  const configured = (process.env.AI_TRANSLATION_PROVIDER || "").trim().toLowerCase();
  if (configured === "openai" || configured === "anthropic") {
    return configured;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }

  return "openai";
}

/**
 * Translate a single transcript line to the target language.
 * Preserves speaker intent and keeps technical terms/names unchanged.
 */
export async function translateMeetingText(params: {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}): Promise<TranslationResult> {
  const text = params.text.trim();
  const targetLanguage = params.targetLanguage.trim();
  const sourceLanguage = params.sourceLanguage?.trim() || "auto";

  if (!text) {
    return {
      translatedText: "",
      sourceLanguage,
      targetLanguage,
    };
  }

  if (targetLanguage === "original" || !targetLanguage) {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage: targetLanguage || "original",
    };
  }

  const provider = resolveTranslationProvider();

  if (provider === "anthropic") {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return { translatedText: text, sourceLanguage, targetLanguage };
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
          model: ANTHROPIC_TRANSLATION_MODEL,
          max_tokens: 1024,
          temperature: 0,
          system:
            "You are a real-time meeting translator. Return only JSON with keys: translatedText (string), sourceLanguage (string), targetLanguage (string). Preserve speaker intent, keep technical terms and names unchanged.",
          messages: [
            {
              role: "user",
              content: `Translate this meeting transcript line from ${sourceLanguage} to ${targetLanguage}:\n\n${text}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        return { translatedText: text, sourceLanguage, targetLanguage };
      }

      const completion = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };

      const content = completion.content?.find((item) => item?.type === "text")?.text;
      if (!content) {
        return { translatedText: text, sourceLanguage, targetLanguage };
      }

      return parseTranslationResponseText(content, targetLanguage);
    } catch {
      return { translatedText: text, sourceLanguage, targetLanguage };
    }
  }

  // Default to OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { translatedText: text, sourceLanguage, targetLanguage };
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TRANSLATION_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a real-time meeting translator. Return only JSON with keys: translatedText (string), sourceLanguage (string), targetLanguage (string). Preserve speaker intent, keep technical terms and names unchanged.",
          },
          {
            role: "user",
            content: `Translate this meeting transcript line from ${sourceLanguage} to ${targetLanguage}:\n\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return { translatedText: text, sourceLanguage, targetLanguage };
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return { translatedText: text, sourceLanguage, targetLanguage };
    }

    return parseTranslationResponseText(content, targetLanguage);
  } catch {
    return { translatedText: text, sourceLanguage, targetLanguage };
  }
}
