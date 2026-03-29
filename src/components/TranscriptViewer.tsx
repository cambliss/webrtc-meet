"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import { renderHighlightedText, searchTranscriptLines } from "@/src/lib/smartHighlights";

type TranscriptViewerProps = {
  transcripts: Array<{
    id: string;
    speakerName: string;
    text: string;
    isFinal: boolean;
    createdAt: string;
    userId?: string | null;
    avatarPath?: string | null;
  }>;
};

export function TranscriptViewer({ transcripts }: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const transcriptLines = useMemo(
    () =>
      transcripts.map((t) => ({
        id: t.id,
        roomId: "",
        socketId: "",
        speakerName: t.speakerName,
        text: t.text,
        isFinal: t.isFinal,
        createdAt: new Date(t.createdAt).getTime(),
      })),
    [transcripts],
  );

  const searchResult = useMemo(
    () => searchTranscriptLines(transcriptLines, searchQuery),
    [transcriptLines, searchQuery],
  );

  const highlightMap = useMemo(() => {
    const map: Record<string, { matchStartIndices: number[]; matchEndIndices: number[] }> = {};
    for (const match of searchResult.matches) {
      map[match.lineId] = {
        matchStartIndices: match.matchStartIndices,
        matchEndIndices: match.matchEndIndices,
      };
    }
    return map;
  }, [searchResult]);

  return (
    <div className="space-y-3">
      {transcripts.length > 0 && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript…"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {searchQuery && highlightMap && Object.keys(highlightMap).length > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              {Object.keys(highlightMap).length} match{Object.keys(highlightMap).length !== 1 ? "es" : ""}
            </span>
          )}
        </div>
      )}

      <div className="max-h-[420px] space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        {transcripts.length === 0 ? (
          <p className="text-sm text-slate-500">No transcript captured.</p>
        ) : (
          transcripts.map((line) => {
            const highlightData = highlightMap[line.id];
            const hasHighlight = highlightData && searchQuery;
            const highlightedParts = hasHighlight
              ? renderHighlightedText(line.text, highlightData.matchStartIndices, highlightData.matchEndIndices)
              : [{ text: line.text, isHighlight: false }];

            return (
              <div
                key={line.id}
                className={`flex gap-2 text-sm leading-relaxed ${
                  hasHighlight ? "rounded border border-amber-300/50 bg-amber-50/50 p-2" : ""
                } text-slate-800`}
              >
                {line.userId && line.avatarPath ? (
                  <div className="relative mt-0.5 h-5 w-5 shrink-0 overflow-hidden rounded-full border border-slate-300">
                    <Image
                      src={`/api/auth/avatar/${encodeURIComponent(line.userId)}`}
                      alt={line.speakerName}
                      fill
                      className="object-cover"
                      unoptimized
                      sizes="20px"
                    />
                  </div>
                ) : null}
                <div className="flex-1">
                  <span className="font-semibold text-slate-900">{line.speakerName}:</span>{" "}
                  {highlightedParts.map((part, idx) => (
                    <span
                      key={idx}
                      className={part.isHighlight ? "rounded bg-amber-300/60 font-medium text-slate-900" : ""}
                    >
                      {part.text}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
