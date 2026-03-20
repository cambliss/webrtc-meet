const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";

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

  if (!targetLanguage) {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage: "original",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage,
    };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TRANSLATION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a real-time meeting translator. Return only JSON with keys: translatedText (string), sourceLanguage (string), targetLanguage (string). Preserve speaker intent and keep names/acronyms unchanged.",
        },
        {
          role: "user",
          content: `Translate this meeting transcript line.\\nSource language: ${sourceLanguage}.\\nTarget language: ${targetLanguage}.\\nText: ${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage,
    };
  }

  const completion = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage,
    };
  }

  try {
    const parsed = JSON.parse(content);
    return normalizeTranslationShape(parsed, targetLanguage);
  } catch {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage,
    };
  }
}
