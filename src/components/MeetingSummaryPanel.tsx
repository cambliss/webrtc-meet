"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MeetingNotesActions } from "@/src/components/MeetingNotesActions";
import { formatMeetingNotesExport } from "@/src/lib/meetingNotes";
import { extractSemanticHighlights, renderHighlightedText } from "@/src/lib/smartHighlights";
import type { MeetingSummaryResult } from "@/src/types/ai";
import type { TranscriptLine } from "@/src/types/meeting";

type MeetingSummaryPanelProps = {
  transcriptLines: TranscriptLine[];
  isMeetingEnded: boolean;
};

const initialSummary: MeetingSummaryResult = {
  summary: "Summary will appear after generation.",
  keyPoints: [],
  actionItems: [],
};

export function MeetingSummaryPanel({ transcriptLines, isMeetingEnded }: MeetingSummaryPanelProps) {
  const [summary, setSummary] = useState<MeetingSummaryResult>(initialSummary);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [autoNotesEnabled, setAutoNotesEnabled] = useState(true);
  const lastAutoSummaryLineCountRef = useRef(0);
  const lastSummarizedTranscriptRef = useRef("");
  const summaryRequestInFlightRef = useRef(false);

  const finalizedTranscriptLines = useMemo(() => {
    return transcriptLines
      .filter((line) => line.isFinal)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [transcriptLines]);

  const transcriptText = useMemo(() => {
    return finalizedTranscriptLines
      .map((line) => `${line.speakerName}: ${line.text}`)
      .join("\n");
  }, [finalizedTranscriptLines]);

  const semanticHighlights = useMemo(() => {
    return extractSemanticHighlights(finalizedTranscriptLines).slice(0, 6);
  }, [finalizedTranscriptLines]);

  const exportText = useMemo(() => {
    return formatMeetingNotesExport({
      roomLabel: "Current meeting",
      summary,
      smartHighlights: semanticHighlights.map((item) => ({
        speakerName: item.speakerName,
        text: item.text,
      })),
    });
  }, [semanticHighlights, summary]);

  const generateSummary = useCallback(async (mode: "manual" | "auto" | "final" = "manual") => {
    if (!transcriptText.trim()) {
      setSummary({
        summary: "Transcript is empty.",
        keyPoints: [],
        actionItems: [],
      });
      return;
    }

    if (summaryRequestInFlightRef.current) {
      return;
    }

    if (mode !== "manual" && lastSummarizedTranscriptRef.current === transcriptText) {
      return;
    }

    summaryRequestInFlightRef.current = true;
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai/meeting-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptText }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Failed to generate summary");
      }

      const payload = (await response.json()) as MeetingSummaryResult;
      setSummary(payload);
      lastSummarizedTranscriptRef.current = transcriptText;
      lastAutoSummaryLineCountRef.current = finalizedTranscriptLines.length;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Summary generation failed");
    } finally {
      summaryRequestInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [finalizedTranscriptLines.length, transcriptText]);

  useEffect(() => {
    if (!isMeetingEnded) {
      return;
    }

    generateSummary("final").catch(() => undefined);
  }, [generateSummary, isMeetingEnded]);

  useEffect(() => {
    if (isMeetingEnded || !autoNotesEnabled) {
      return;
    }

    if (finalizedTranscriptLines.length < 4) {
      return;
    }

    const newLineCount = finalizedTranscriptLines.length - lastAutoSummaryLineCountRef.current;
    if (newLineCount < 4) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      generateSummary("auto").catch(() => undefined);
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoNotesEnabled, finalizedTranscriptLines.length, generateSummary, isMeetingEnded]);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#d7e4f8] bg-white shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#d7e4f8] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#202124]">Meeting Summary</h2>
          <p className="text-xs text-[#5f6368]">Rolling notes, semantic highlights, and action tracking.</p>
        </div>
        <div className="flex items-center gap-2">
          <MeetingNotesActions exportText={exportText} fileName="meeting-notes.txt" />
          <button
            type="button"
            onClick={() => setAutoNotesEnabled((current) => !current)}
            className={`rounded-md border px-2 py-1 text-xs font-semibold ${
              autoNotesEnabled
                ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                : "border-[#d7e4f8] bg-white text-[#5f6368]"
            }`}
          >
            Auto Notes {autoNotesEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={() => {
              generateSummary("manual").catch(() => undefined);
            }}
            disabled={isLoading}
            className="rounded-md border border-[#1a73e8] bg-[#e8f0fe] px-2 py-1 text-xs font-semibold text-[#1a73e8] disabled:opacity-50"
          >
            {isLoading ? "Generating..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {error && <p className="rounded-lg bg-[#fde7e9] p-2 text-[#b3261e]">{error}</p>}

        <article className="rounded-lg border border-[#d7e4f8] bg-[#f8fbff] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5f6368]">Summary</h3>
          <p className="text-[#202124]">{summary.summary}</p>
        </article>

        <article className="rounded-lg border border-[#d7e4f8] bg-[#f8fbff] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#5f6368]">Smart Highlights</h3>
            <span className="text-xs text-[#5f6368]">{semanticHighlights.length} detected</span>
          </div>
          {semanticHighlights.length === 0 ? (
            <p className="text-[#5f6368]">Highlights will appear as decisions, commitments, and priorities are detected.</p>
          ) : (
            <div className="space-y-2">
              {semanticHighlights.map((highlight) => (
                <div key={highlight.lineId} className="rounded-lg border border-[#d7e4f8] bg-white px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a73e8]">
                    {highlight.speakerName}
                  </p>
                  <p className="text-[#202124]">
                    {renderHighlightedText(
                      highlight.text,
                      highlight.matchStartIndices,
                      highlight.matchEndIndices,
                    ).map((part, index) =>
                      part.isHighlight ? (
                        <mark key={`${highlight.lineId}-${index}`} className="rounded bg-[#d2e3fc] px-0.5 text-[#174ea6]">
                          {part.text}
                        </mark>
                      ) : (
                        <span key={`${highlight.lineId}-${index}`}>{part.text}</span>
                      ),
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-lg border border-[#d7e4f8] bg-[#f8fbff] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5f6368]">Key Points</h3>
          {summary.keyPoints.length === 0 ? (
            <p className="text-[#5f6368]">No key points yet.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-[#202124]">
              {summary.keyPoints.map((point, index) => (
                <li key={`${point}-${index}`}>{point}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-lg border border-[#d7e4f8] bg-[#f8fbff] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5f6368]">Action Items</h3>
          {summary.actionItems.length === 0 ? (
            <p className="text-[#5f6368]">No action items yet.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-[#202124]">
              {summary.actionItems.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
