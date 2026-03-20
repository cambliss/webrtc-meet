const OPENAI_TTS_API_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_DEFAULT_VOICE = process.env.OPENAI_TTS_DEFAULT_VOICE || "alloy";

type SynthesizeSpeechParams = {
  text: string;
  targetLanguage: string;
};

function trimForSpeech(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 1000) {
    return trimmed;
  }

  return `${trimmed.slice(0, 997)}...`;
}

export async function synthesizeTranslatedSpeech(
  params: SynthesizeSpeechParams,
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const text = trimForSpeech(params.text);
  if (!text) {
    return null;
  }

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
      format: "mp3",
      instructions: `Speak naturally in ${params.targetLanguage}. Keep pronunciation clear for meeting playback.`,
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
}
