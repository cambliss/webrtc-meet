"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const transcriptText = useMemo(() => {
    return transcriptLines
      .filter((line) => line.isFinal)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((line) => `${line.speakerName}: ${line.text}`)
      .join("\n");
  }, [transcriptLines]);

  const generateSummary = useCallback(async () => {
    if (!transcriptText.trim()) {
      setSummary({
        summary: "Transcript is empty.",
        keyPoints: [],
        actionItems: [],
      });
      return;
    }

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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Summary generation failed");
    } finally {
      setIsLoading(false);
    }
  }, [transcriptText]);

  useEffect(() => {
    if (!isMeetingEnded) {
      return;
    }

    generateSummary().catch(() => undefined);
  }, [generateSummary, isMeetingEnded]);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-700/70 bg-slate-900/80">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Meeting Summary</h2>
        <button
          type="button"
          onClick={() => {
            generateSummary().catch(() => undefined);
          }}
          disabled={isLoading}
          className="rounded-md border border-cyan-400/50 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-100 disabled:opacity-50"
        >
          {isLoading ? "Generating..." : "Generate"}
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {error && <p className="rounded-lg bg-rose-900/40 p-2 text-rose-200">{error}</p>}

        <article className="rounded-lg bg-slate-800/70 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Summary</h3>
          <p className="text-slate-100">{summary.summary}</p>
        </article>

        <article className="rounded-lg bg-slate-800/70 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Key Points</h3>
          {summary.keyPoints.length === 0 ? (
            <p className="text-slate-400">No key points yet.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-slate-100">
              {summary.keyPoints.map((point, index) => (
                <li key={`${point}-${index}`}>{point}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-lg bg-slate-800/70 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Action Items</h3>
          {summary.actionItems.length === 0 ? (
            <p className="text-slate-400">No action items yet.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-slate-100">
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
