"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type HistoryItem = {
  meetingId: string;
  roomId: string;
  endedAt: string | null;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  createdAt: string;
  transcriptCount: number;
  hasRecording: boolean;
};

type MeetingHistorySearchProps = {
  history: HistoryItem[];
};

export function MeetingHistorySearch({ history }: MeetingHistorySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Simple client-side filtering by room, summary, key points, action items
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) {
      return history;
    }

    const query = searchQuery.toLowerCase();
    return history.filter(
      (item) =>
        item.roomId.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query) ||
        item.keyPoints.some((point) => point.toLowerCase().includes(query)) ||
        item.actionItems.some((item) => item.toLowerCase().includes(query)),
    );
  }, [history, searchQuery]);

  return (
    <>
      {history.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by room, summary, key points, or action items…"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {searchQuery && filteredHistory.length > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              {filteredHistory.length} result{filteredHistory.length !== 1 ? "s" : ""}
            </span>
          )}
          {searchQuery && filteredHistory.length === 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-900">No results</span>
          )}
        </div>
      )}

      <section className="space-y-3">
        {filteredHistory.length === 0 && searchQuery && (
          <div className="rounded-2xl border border-slate-300 bg-white/80 p-4 text-sm text-slate-700">
            No meetings found matching &quot;{searchQuery}&quot;.
          </div>
        )}

        {filteredHistory.length === 0 && !searchQuery && (
          <section className="rounded-2xl border border-slate-300 bg-white/80 p-4 text-sm text-slate-700">
            No meetings summarized yet.
          </section>
        )}

        {filteredHistory.map((item) => (
          <article key={`${item.meetingId}-${item.createdAt}`} className="rounded-2xl border border-slate-300 bg-white/90 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>Room: {item.roomId}</span>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                Transcript lines: {item.transcriptCount}
              </span>
              <span
                className={`rounded-full px-2 py-1 ${
                  item.hasRecording ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.hasRecording ? "Recording available" : "No recording"}
              </span>
            </div>

            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">Summary</h2>
            <p className="mb-3 text-sm text-slate-900">{item.summary}</p>

            <h3 className="mb-1 text-sm font-semibold text-slate-700">Key Points</h3>
            {item.keyPoints.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">None</p>
            ) : (
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
                {item.keyPoints.map((point, index) => (
                  <li key={`${point}-${index}`}>{point}</li>
                ))}
              </ul>
            )}

            <h3 className="mb-1 text-sm font-semibold text-slate-700">Action Items</h3>
            {item.actionItems.length === 0 ? (
              <p className="text-sm text-slate-500">None</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                {item.actionItems.map((itemText, index) => (
                  <li key={`${itemText}-${index}`}>{itemText}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link
                href={`/meeting-history/${item.meetingId}`}
                className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 font-medium text-cyan-700"
              >
                Open summary details
              </Link>
              <Link
                href={`/meeting-history/${item.meetingId}/analytics`}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700"
              >
                Open analytics
              </Link>
              {item.hasRecording && (
                <Link
                  href={`/api/meetings/${item.meetingId}/recording`}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700"
                >
                  Download recording
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
