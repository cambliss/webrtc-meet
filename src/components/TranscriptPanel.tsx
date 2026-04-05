"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { UserAvatar } from "@/src/components/UserAvatar";
import type { TranscriptLine } from "@/src/types/meeting";
import { renderHighlightedText, searchTranscriptLines } from "@/src/lib/smartHighlights";

type TranscriptPanelProps = {
  lines: TranscriptLine[];
  activeSpeakerSocketId?: string | null;
  selectedLanguage?: string;
  onLanguageChange?: (language: string) => void;
  speakTranslated?: boolean;
  onSpeakTranslatedChange?: (enabled: boolean) => void;
  speakerVoiceByName?: Record<string, string>;
  showControls?: boolean;
  enableSearch?: boolean;
  speakerAvatarPathBySocketId?: Record<string, string | null | undefined>;
  speakerAvatarVersionBySocketId?: Record<string, number | null | undefined>;
  speakerUserIdBySocketId?: Record<string, string | null | undefined>;
};

type TranslationLineState = {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export const TRANSCRIPT_LANGUAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Original", value: "original" },
  { label: "English", value: "English" },
  { label: "Afrikaans", value: "Afrikaans" },
  { label: "Albanian", value: "Albanian" },
  { label: "Amharic", value: "Amharic" },
  { label: "Arabic", value: "Arabic" },
  { label: "Armenian", value: "Armenian" },
  { label: "Assamese", value: "Assamese" },
  { label: "Azerbaijani", value: "Azerbaijani" },
  { label: "Basque", value: "Basque" },
  { label: "Belarusian", value: "Belarusian" },
  { label: "Bengali", value: "Bengali" },
  { label: "Bosnian", value: "Bosnian" },
  { label: "Bulgarian", value: "Bulgarian" },
  { label: "Burmese", value: "Burmese" },
  { label: "Catalan", value: "Catalan" },
  { label: "Mandarin Chinese", value: "Mandarin Chinese" },
  { label: "Chinese (Traditional)", value: "Chinese (Traditional)" },
  { label: "Croatian", value: "Croatian" },
  { label: "Czech", value: "Czech" },
  { label: "Danish", value: "Danish" },
  { label: "Dutch", value: "Dutch" },
  { label: "Estonian", value: "Estonian" },
  { label: "Filipino", value: "Filipino" },
  { label: "Finnish", value: "Finnish" },
  { label: "French", value: "French" },
  { label: "Galician", value: "Galician" },
  { label: "Georgian", value: "Georgian" },
  { label: "German", value: "German" },
  { label: "Greek", value: "Greek" },
  { label: "Gujarati", value: "Gujarati" },
  { label: "Hebrew", value: "Hebrew" },
  { label: "Hindi", value: "Hindi" },
  { label: "Hungarian", value: "Hungarian" },
  { label: "Icelandic", value: "Icelandic" },
  { label: "Indonesian", value: "Indonesian" },
  { label: "Irish", value: "Irish" },
  { label: "Italian", value: "Italian" },
  { label: "Japanese", value: "Japanese" },
  { label: "Kannada", value: "Kannada" },
  { label: "Kazakh", value: "Kazakh" },
  { label: "Khmer", value: "Khmer" },
  { label: "Korean", value: "Korean" },
  { label: "Kyrgyz", value: "Kyrgyz" },
  { label: "Lao", value: "Lao" },
  { label: "Latvian", value: "Latvian" },
  { label: "Lithuanian", value: "Lithuanian" },
  { label: "Macedonian", value: "Macedonian" },
  { label: "Malay", value: "Malay" },
  { label: "Malayalam", value: "Malayalam" },
  { label: "Maltese", value: "Maltese" },
  { label: "Marathi", value: "Marathi" },
  { label: "Mongolian", value: "Mongolian" },
  { label: "Nepali", value: "Nepali" },
  { label: "Norwegian", value: "Norwegian" },
  { label: "Odia", value: "Odia" },
  { label: "Persian", value: "Persian" },
  { label: "Polish", value: "Polish" },
  { label: "Portuguese", value: "Portuguese" },
  { label: "Punjabi", value: "Punjabi" },
  { label: "Romanian", value: "Romanian" },
  { label: "Russian", value: "Russian" },
  { label: "Serbian", value: "Serbian" },
  { label: "Sinhala", value: "Sinhala" },
  { label: "Slovak", value: "Slovak" },
  { label: "Slovenian", value: "Slovenian" },
  { label: "Spanish", value: "Spanish" },
  { label: "Swahili", value: "Swahili" },
  { label: "Swedish", value: "Swedish" },
  { label: "Tamil", value: "Tamil" },
  { label: "Telugu", value: "Telugu" },
  { label: "Thai", value: "Thai" },
  { label: "Turkish", value: "Turkish" },
  { label: "Ukrainian", value: "Ukrainian" },
  { label: "Urdu", value: "Urdu" },
  { label: "Uzbek", value: "Uzbek" },
  { label: "Vietnamese", value: "Vietnamese" },
  { label: "Welsh", value: "Welsh" },
  { label: "Xhosa", value: "Xhosa" },
  { label: "Yoruba", value: "Yoruba" },
  { label: "Zulu", value: "Zulu" },
];

export const LANGUAGE_TO_SPEECH_LOCALE: Record<string, string> = {
  Afrikaans: "af-ZA",
  Albanian: "sq-AL",
  Amharic: "am-ET",
  Arabic: "ar-SA",
  Armenian: "hy-AM",
  Assamese: "as-IN",
  Azerbaijani: "az-AZ",
  Basque: "eu-ES",
  Belarusian: "be-BY",
  Bengali: "bn-IN",
  Bosnian: "bs-BA",
  Bulgarian: "bg-BG",
  Burmese: "my-MM",
  Catalan: "ca-ES",
  "Chinese (Traditional)": "zh-TW",
  Croatian: "hr-HR",
  Czech: "cs-CZ",
  Danish: "da-DK",
  Dutch: "nl-NL",
  English: "en-US",
  Estonian: "et-EE",
  Filipino: "fil-PH",
  Finnish: "fi-FI",
  French: "fr-FR",
  Galician: "gl-ES",
  Georgian: "ka-GE",
  German: "de-DE",
  Greek: "el-GR",
  Gujarati: "gu-IN",
  Hebrew: "he-IL",
  Hindi: "hi-IN",
  Hungarian: "hu-HU",
  Icelandic: "is-IS",
  Indonesian: "id-ID",
  Irish: "ga-IE",
  Italian: "it-IT",
  Japanese: "ja-JP",
  Kannada: "kn-IN",
  Kazakh: "kk-KZ",
  Khmer: "km-KH",
  Korean: "ko-KR",
  Kyrgyz: "ky-KG",
  Lao: "lo-LA",
  Latvian: "lv-LV",
  Lithuanian: "lt-LT",
  Macedonian: "mk-MK",
  Malay: "ms-MY",
  Malayalam: "ml-IN",
  Maltese: "mt-MT",
  "Mandarin Chinese": "zh-CN",
  Marathi: "mr-IN",
  Mongolian: "mn-MN",
  Nepali: "ne-NP",
  Norwegian: "nb-NO",
  Odia: "or-IN",
  Persian: "fa-IR",
  Polish: "pl-PL",
  Portuguese: "pt-PT",
  Punjabi: "pa-IN",
  Romanian: "ro-RO",
  Russian: "ru-RU",
  Serbian: "sr-RS",
  Sinhala: "si-LK",
  Slovak: "sk-SK",
  Slovenian: "sl-SI",
  Spanish: "es-ES",
  Swahili: "sw-KE",
  Swedish: "sv-SE",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Thai: "th-TH",
  Turkish: "tr-TR",
  Ukrainian: "uk-UA",
  Urdu: "ur-IN",
  Uzbek: "uz-UZ",
  Vietnamese: "vi-VN",
  Welsh: "cy-GB",
  Xhosa: "xh-ZA",
  Yoruba: "yo-NG",
  Zulu: "zu-ZA",
};

export function TranscriptPanel({
  lines,
  activeSpeakerSocketId,
  selectedLanguage,
  onLanguageChange,
  speakTranslated,
  onSpeakTranslatedChange,
  speakerVoiceByName,
  showControls = true,
  enableSearch = false,
  speakerAvatarPathBySocketId,
  speakerAvatarVersionBySocketId,
  speakerUserIdBySocketId,
}: TranscriptPanelProps) {

  const [localTargetLanguage, setLocalTargetLanguage] = useState("original");
  const [panelLangSearchInput, setPanelLangSearchInput] = useState("");
  const [translatedByLineKey, setTranslatedByLineKey] = useState<Record<string, TranslationLineState>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [localSpeakTranslated, setLocalSpeakTranslated] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightMatches, setHighlightMatches] = useState<Record<string, { matchStartIndices: number[]; matchEndIndices: number[] }>>({});
  const spokenKeysRef = useRef<Record<string, true>>({});
  const audioQueueRef = useRef<Array<{ dataUrl: string; key: string }>>([]);
  const isAudioPlayingRef = useRef(false);
  const lastSpokenAtBySpeakerRef = useRef<Record<string, number>>({});
  const lastSpokenTextBySpeakerRef = useRef<Record<string, string>>({});
  const pendingTranslationKeysRef = useRef<Record<string, true>>({});
  const lastInterimTranslationAtRef = useRef<Record<string, number>>({});
  const lastInterimTranslatedTextRef = useRef<Record<string, string>>({});

  const targetLanguage = selectedLanguage ?? localTargetLanguage;
  const voiceTranslatorEnabled = speakTranslated ?? localSpeakTranslated;

  const setTargetLanguage = (language: string) => {
    if (onLanguageChange) {
      onLanguageChange(language);
      return;
    }
    setLocalTargetLanguage(language);
  };

  const commitPanelLangInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setTargetLanguage("original");
      return;
    }

    const matched = TRANSCRIPT_LANGUAGE_OPTIONS.find(
      (o) =>
        o.label.toLowerCase() === trimmed.toLowerCase() ||
        o.value.toLowerCase() === trimmed.toLowerCase(),
    );
    setTargetLanguage(matched ? matched.value : trimmed);
  };

  // Keep panel search input text in sync when targetLanguage changes externally.
  useEffect(() => {
    if (targetLanguage === "original") {
      setPanelLangSearchInput("");
    } else {
      const option = TRANSCRIPT_LANGUAGE_OPTIONS.find((o) => o.value === targetLanguage);
      setPanelLangSearchInput(option ? option.label : targetLanguage);
    }
  }, [targetLanguage]);

  const setSpeakTranslated = (enabled: boolean) => {
    if (onSpeakTranslatedChange) {
      onSpeakTranslatedChange(enabled);
      return;
    }
    setLocalSpeakTranslated(enabled);
  };

  const sorted = useMemo(
    () => [...lines].sort((a, b) => a.createdAt - b.createdAt),
    [lines],
  );

  const latestInterimLine = useMemo(() => {
    const interim = sorted.filter((line) => !line.isFinal);
    if (interim.length === 0) {
      return null;
    }

    if (!activeSpeakerSocketId) {
      return interim[interim.length - 1];
    }

    for (let i = interim.length - 1; i >= 0; i -= 1) {
      if (interim[i].socketId === activeSpeakerSocketId) {
        return interim[i];
      }
    }

    return interim[interim.length - 1];
  }, [sorted, activeSpeakerSocketId]);

  function translationKeyFor(line: TranscriptLine, language: string): string {
    return `${line.id}:${line.text}:${language}`;
  }

  async function requestTranslation(line: TranscriptLine, language: string): Promise<void> {
    const lineKey = translationKeyFor(line, language);
    if (pendingTranslationKeysRef.current[lineKey]) {
      return;
    }

    pendingTranslationKeysRef.current[lineKey] = true;

    try {
      const response = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line.text,
          targetLanguage: language,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        translatedText?: string;
        sourceLanguage?: string;
        targetLanguage?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Translation failed");
      }

      const translatedText = payload.translatedText?.trim() || line.text;
      const sourceLanguage = payload.sourceLanguage?.trim() || "auto";
      const targetLanguageLabel = payload.targetLanguage?.trim() || language;

      setTranslatedByLineKey((prev) => ({
        ...prev,
        [lineKey]: {
          translatedText,
          sourceLanguage,
          targetLanguage: targetLanguageLabel,
        },
      }));
    } finally {
      delete pendingTranslationKeysRef.current[lineKey];
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };

    syncVoices();
    window.speechSynthesis.onvoiceschanged = syncVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const playNextQueuedAudio = () => {
    if (isAudioPlayingRef.current || typeof window === "undefined") {
      return;
    }

    const next = audioQueueRef.current.shift();
    if (!next) {
      return;
    }

    const audio = new Audio(next.dataUrl);
    isAudioPlayingRef.current = true;

    const finish = () => {
      isAudioPlayingRef.current = false;
      void playNextQueuedAudio();
    };

    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(() => {
      finish();
    });
  };

  useEffect(() => {
    if (selectedLanguage) {
      return;
    }
    const key = "meeting-transcript-target-language";
    const stored = window.localStorage.getItem(key);
    if (stored) {
      setLocalTargetLanguage(stored);
    }
  }, [selectedLanguage]);

  // Search highlighting effect
  useEffect(() => {
    if (!enableSearch || !searchQuery.trim()) {
      setHighlightMatches({});
      return;
    }

    const result = searchTranscriptLines(lines, searchQuery);
    const matchMap: Record<string, { matchStartIndices: number[]; matchEndIndices: number[] }> = {};
    for (const match of result.matches) {
      matchMap[match.lineId] = {
        matchStartIndices: match.matchStartIndices,
        matchEndIndices: match.matchEndIndices,
      };
    }
    setHighlightMatches(matchMap);
  }, [searchQuery, lines, enableSearch]);

  useEffect(() => {
    if (selectedLanguage) {
      return;
    }
    const key = "meeting-transcript-target-language";
    window.localStorage.setItem(key, targetLanguage);
  }, [selectedLanguage, targetLanguage]);

  useEffect(() => {
    if (targetLanguage === "original") {
      setIsTranslating(false);
      setTranslationError("");
      return;
    }

    let cancelled = false;
    const missingFinalLines = sorted.filter(
      (line) => line.isFinal && !translatedByLineKey[translationKeyFor(line, targetLanguage)],
    );

    if (missingFinalLines.length === 0) {
      setIsTranslating(false);
      return;
    }

    const run = async () => {
      setIsTranslating(true);
      setTranslationError("");

      try {
        for (const line of missingFinalLines) {
          if (cancelled) {
            return;
          }
          await requestTranslation(line, targetLanguage);
        }
      } catch (error) {
        if (!cancelled) {
          setTranslationError(error instanceof Error ? error.message : "Translation unavailable");
        }
      } finally {
        if (!cancelled) {
          setIsTranslating(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [sorted, targetLanguage, translatedByLineKey]);

  useEffect(() => {
    if (targetLanguage === "original" || !latestInterimLine) {
      return;
    }

    const interimText = latestInterimLine.text.trim();
    if (interimText.length < 8) {
      return;
    }

    const interimSpeakerKey = latestInterimLine.socketId || latestInterimLine.speakerName;
    if (lastInterimTranslatedTextRef.current[interimSpeakerKey] === interimText) {
      return;
    }

    const lineKey = translationKeyFor(latestInterimLine, targetLanguage);
    if (translatedByLineKey[lineKey]) {
      return;
    }

    let cancelled = false;
    const baseDebounceMs =
      activeSpeakerSocketId && latestInterimLine.socketId === activeSpeakerSocketId
        ? 500
        : 800;
    const now = Date.now();
    const minInterimIntervalMs = 1200;
    const lastRequestAt = lastInterimTranslationAtRef.current[interimSpeakerKey] || 0;
    const waitForIntervalMs = Math.max(0, minInterimIntervalMs - (now - lastRequestAt));
    const debounceMs = Math.max(baseDebounceMs, waitForIntervalMs);

    const timeoutId = window.setTimeout(() => {
      lastInterimTranslationAtRef.current[interimSpeakerKey] = Date.now();
      void requestTranslation(latestInterimLine, targetLanguage)
        .then(() => {
          lastInterimTranslatedTextRef.current[interimSpeakerKey] = interimText;
        })
        .catch((error) => {
          if (!cancelled) {
            setTranslationError(error instanceof Error ? error.message : "Translation unavailable");
          }
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [latestInterimLine, targetLanguage, translatedByLineKey, activeSpeakerSocketId]);

  useEffect(() => {
    if (!voiceTranslatorEnabled || targetLanguage === "original" || typeof window === "undefined") {
      return;
    }

    const finalLines = sorted.filter((line) => line.isFinal);
    const latestFinal = finalLines.length > 0 ? finalLines[finalLines.length - 1] : null;
    const latestInterim = latestInterimLine;

    const latest =
      latestFinal && latestInterim
        ? latestFinal.createdAt >= latestInterim.createdAt
          ? latestFinal
          : latestInterim
        : latestFinal || latestInterim;

    if (!latest) {
      return;
    }

    const key = `${latest.id}:${latest.text}:${targetLanguage}`;
    if (spokenKeysRef.current[key]) {
      return;
    }

    const translatedState = translatedByLineKey[key];
    if (!translatedState?.translatedText) {
      return;
    }

    const speakerRateKey = `${latest.socketId || latest.speakerName}:${targetLanguage}`;
    const now = Date.now();
    const lastSpokenAt = lastSpokenAtBySpeakerRef.current[speakerRateKey] || 0;
    const minSpeakIntervalMs = latest.isFinal ? 1200 : 2200;
    if (now - lastSpokenAt < minSpeakIntervalMs) {
      return;
    }

    const spokenTextKey = `${speakerRateKey}:${translatedState.translatedText.trim()}`;
    if (lastSpokenTextBySpeakerRef.current[speakerRateKey] === spokenTextKey) {
      return;
    }

    let cancelled = false;

    const speak = async () => {
      try {
        const response = await fetch("/api/ai/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: translatedState.translatedText,
            targetLanguage,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          audioBase64?: string;
          mimeType?: string;
        };

        if (!cancelled && response.ok && payload.audioBase64) {
          const mimeType = payload.mimeType || "audio/mpeg";
          const dataUrl = `data:${mimeType};base64,${payload.audioBase64}`;
          // Keep queue short so listeners hear the newest translation first.
          if (audioQueueRef.current.length > 3) {
            audioQueueRef.current = audioQueueRef.current.slice(-1);
          }
          audioQueueRef.current.push({ dataUrl, key });
          spokenKeysRef.current[key] = true;
          lastSpokenAtBySpeakerRef.current[speakerRateKey] = Date.now();
          lastSpokenTextBySpeakerRef.current[speakerRateKey] = spokenTextKey;
          void playNextQueuedAudio();
          return;
        }
      } catch {
        // Fall back to local speech synthesis below.
      }

      if (cancelled) {
        return;
      }

      const utterance = new SpeechSynthesisUtterance(translatedState.translatedText);
      utterance.lang = LANGUAGE_TO_SPEECH_LOCALE[targetLanguage] || "en-US";

      const preferredVoiceUri = speakerVoiceByName?.[latest.speakerName];
      if (preferredVoiceUri) {
        const preferredVoice = availableVoices.find((voice) => voice.voiceURI === preferredVoiceUri);
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }

      window.speechSynthesis.speak(utterance);
      spokenKeysRef.current[key] = true;
      lastSpokenAtBySpeakerRef.current[speakerRateKey] = Date.now();
      lastSpokenTextBySpeakerRef.current[speakerRateKey] = spokenTextKey;
    };

    void speak();

    return () => {
      cancelled = true;
    };
  }, [
    sorted,
    latestInterimLine,
    voiceTranslatorEnabled,
    targetLanguage,
    translatedByLineKey,
    speakerVoiceByName,
    availableVoices,
  ]);

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-[#d7e4f8] bg-white shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
      <header className="border-b border-[#d7e4f8] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#202124]">Live Transcript</h2>
          {showControls && !enableSearch && (
            <>
              <input
                list="transcript-language-datalist"
                value={panelLangSearchInput}
                onChange={(event) => {
                  const raw = event.target.value;
                  setPanelLangSearchInput(raw);
                  const matched = TRANSCRIPT_LANGUAGE_OPTIONS.find(
                    (o) =>
                      o.label.toLowerCase() === raw.toLowerCase() ||
                      o.value.toLowerCase() === raw.toLowerCase(),
                  );
                  if (matched) {
                    setTargetLanguage(matched.value);
                  } else if (raw === "") {
                    setTargetLanguage("original");
                  }
                }}
                onBlur={(event) => commitPanelLangInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    (event.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Search or type language…"
                className="w-44 rounded border border-[#d7e4f8] bg-[#f7fbff] px-2 py-1 text-xs text-[#202124] placeholder-[#8a9099] focus:outline-none focus:ring-1 focus:ring-[#1a73e8]"
              />
              <datalist id="transcript-language-datalist">
                {TRANSCRIPT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.label} />
                ))}
              </datalist>
            </>
          )}
          {enableSearch && (
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search transcript…"
              className="w-48 rounded border border-[#d7e4f8] bg-[#f7fbff] px-2 py-1 text-xs text-[#202124] placeholder-[#8a9099] focus:outline-none focus:ring-1 focus:ring-[#1a73e8]"
            />
          )}
        </div>
        {showControls && targetLanguage !== "original" && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#5f6368]">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={voiceTranslatorEnabled}
                onChange={(event) => setSpeakTranslated(event.target.checked)}
              />
              Speak translated captions
            </label>
            <span>{isTranslating ? "Translating..." : "Live translation on"}</span>
          </div>
        )}
        {enableSearch && Object.keys(highlightMatches).length > 0 && (
          <p className="mt-2 text-[11px] text-[#1a73e8]">{Object.keys(highlightMatches).length} match(es)</p>
        )}
        {translationError && (
          <p className="mt-2 rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">{translationError}</p>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {sorted.length === 0 && (
          <p className="rounded-lg border border-[#d7e4f8] bg-[#f7fbff] p-2 text-[#5f6368]">No transcript yet.</p>
        )}

        {sorted.map((line) => {
          const highlightData = highlightMatches[line.id];
          const hasHighlight = highlightData && enableSearch;
          const displayText = targetLanguage === "original"
            ? line.text
            : translatedByLineKey[`${line.id}:${line.text}:${targetLanguage}`]?.translatedText || line.text;

          const highlightedParts = hasHighlight
            ? renderHighlightedText(displayText, highlightData.matchStartIndices, highlightData.matchEndIndices)
            : [{ text: displayText, isHighlight: false }];

          return (
            <article key={line.id} className={`rounded-lg border border-[#d7e4f8] p-2 ${hasHighlight ? "bg-[#eef4ff]" : "bg-[#f8fbff]"} text-[#202124]`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[#5f6368]">
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar
                    name={line.speakerName}
                    userId={speakerUserIdBySocketId?.[line.socketId]}
                    avatarPath={speakerAvatarPathBySocketId?.[line.socketId]}
                    avatarVersion={speakerAvatarVersionBySocketId?.[line.socketId]}
                    size="sm"
                  />
                  <span className="truncate">{line.speakerName}</span>
                </div>
                <span>{new Date(line.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="break-words">{highlightedParts.map((part, idx) => (
                <span key={idx} className={part.isHighlight ? "rounded bg-[#e9f2ff] font-medium text-[#1a73e8]" : ""}>
                  {part.text}
                </span>
              ))}</p>
              {targetLanguage !== "original" && (
                <p className="mt-1 text-[11px] text-[#5f6368]">
                  Detected: {translatedByLineKey[`${line.id}:${line.text}:${targetLanguage}`]?.sourceLanguage || "auto"} to {targetLanguage}
                  {!line.isFinal ? " • Live preview" : ""}
                </p>
              )}
              {targetLanguage !== "original" && (
                <p className="text-[11px] text-[#5f6368]">Original: {line.text}</p>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
