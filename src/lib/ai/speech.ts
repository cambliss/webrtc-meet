const OPENAI_TTS_API_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "tts-1";
const OPENAI_TTS_DEFAULT_VOICE = process.env.OPENAI_TTS_DEFAULT_VOICE || "alloy";

const GOOGLE_TTS_API_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const DEEPGRAM_TTS_API_URL = "https://api.deepgram.com/v1/speak";
const DEEPGRAM_TTS_DEFAULT_MODEL = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";

// BCP-47 locale codes for Google TTS (supports Odia or-IN natively)
const GOOGLE_TTS_LANG_MAP: Record<string, string> = {
  Afrikaans: "af-ZA",
  Arabic: "ar-XA",
  Bengali: "bn-IN",
  Bulgarian: "bg-BG",
  "Chinese (Traditional)": "zh-TW",
  Croatian: "hr-HR",
  Czech: "cs-CZ",
  Danish: "da-DK",
  Dutch: "nl-NL",
  English: "en-US",
  Filipino: "fil-PH",
  Finnish: "fi-FI",
  French: "fr-FR",
  German: "de-DE",
  Greek: "el-GR",
  Gujarati: "gu-IN",
  Hebrew: "he-IL",
  Hindi: "hi-IN",
  Hungarian: "hu-HU",
  Indonesian: "id-ID",
  Italian: "it-IT",
  Japanese: "ja-JP",
  Kannada: "kn-IN",
  Korean: "ko-KR",
  Latvian: "lv-LV",
  Lithuanian: "lt-LT",
  Malay: "ms-MY",
  Malayalam: "ml-IN",
  "Mandarin Chinese": "zh-CN",
  Marathi: "mr-IN",
  Norwegian: "nb-NO",
  Odia: "or-IN",
  Polish: "pl-PL",
  Portuguese: "pt-PT",
  Punjabi: "pa-IN",
  Romanian: "ro-RO",
  Russian: "ru-RU",
  Serbian: "sr-RS",
  Sinhala: "si-LK",
  Slovak: "sk-SK",
  Spanish: "es-ES",
  Swahili: "sw-KE",
  Swedish: "sv-SE",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Thai: "th-TH",
  Turkish: "tr-TR",
  Ukrainian: "uk-UA",
  Urdu: "ur-IN",
  Vietnamese: "vi-VN",
};

// Deepgram Aura model support is currently focused on English voices.
const DEEPGRAM_MODEL_BY_LANGUAGE: Record<string, string> = {
  English: DEEPGRAM_TTS_DEFAULT_MODEL,
};

type SynthesizeSpeechParams = {
  text: string;
  targetLanguage: string;
};

function trimForSpeech(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 4096) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4093)}...`;
}

/**
 * Synthesize speech using Google Cloud Text-to-Speech (free tier: 1M chars/month).
 * Supports Odia (or-IN) and most Indian languages natively.
 */
async function synthesizeWithGoogle(
  text: string,
  targetLanguage: string,
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const languageCode = GOOGLE_TTS_LANG_MAP[targetLanguage] || "en-US";

  try {
    const response = await fetch(`${GOOGLE_TTS_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, ssmlGender: "FEMALE" },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "(unreadable)");
      console.error(`[speech] Google TTS error ${response.status}: ${errBody}`);
      return null;
    }

    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) {
      return null;
    }

    return { audioBase64: data.audioContent, mimeType: "audio/mpeg" };
  } catch (err) {
    console.error("[speech] Google TTS fetch failed:", err);
    return null;
  }
}

async function synthesizeWithDeepgram(
  text: string,
  targetLanguage: string,
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = DEEPGRAM_MODEL_BY_LANGUAGE[targetLanguage];
  if (!model) {
    return null;
  }

  try {
    const response = await fetch(`${DEEPGRAM_TTS_API_URL}?model=${encodeURIComponent(model)}&encoding=mp3`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "(unreadable)");
      console.error(`[speech] Deepgram TTS error ${response.status}: ${errBody}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    if (!audioBase64) {
      return null;
    }

    return { audioBase64, mimeType: "audio/mpeg" };
  } catch (err) {
    console.error("[speech] Deepgram TTS fetch failed:", err);
    return null;
  }
}

/**
 * Synthesize speech from translated text.
 * Priority: Google Cloud TTS (multilingual) → Deepgram TTS (English) → OpenAI TTS → null (browser fallback)
 */
export async function synthesizeTranslatedSpeech(
  params: SynthesizeSpeechParams,
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const text = trimForSpeech(params.text);
  if (!text) {
    return null;
  }

  // Try Google TTS first (free tier, native Odia support)
  if (process.env.GOOGLE_TTS_API_KEY) {
    const googleResult = await synthesizeWithGoogle(text, params.targetLanguage);
    if (googleResult) {
      return googleResult;
    }
  }

  // Try Deepgram TTS for languages with supported models (currently English).
  if (process.env.DEEPGRAM_API_KEY) {
    const deepgramResult = await synthesizeWithDeepgram(text, params.targetLanguage);
    if (deepgramResult) {
      return deepgramResult;
    }
  }

  // Fall back to OpenAI TTS
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(OPENAI_TTS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_DEFAULT_VOICE,
        input: text,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const mimeType = response.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

    if (!audioBase64) {
      return null;
    }

    return {
      audioBase64,
      mimeType,
    };
  } catch {
    return null;
  }
}
