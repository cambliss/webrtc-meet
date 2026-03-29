"use client";

import { useMemo } from "react";

import type { TranscriptLine } from "@/src/types/meeting";

type LiveCaptionsOverlayProps = {
  lines: TranscriptLine[];
  visible?: boolean;
};

export function LiveCaptionsOverlay({ lines, visible = true }: LiveCaptionsOverlayProps) {
  const captionLines = useMemo(() => {
    return [...lines]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-2);
  }, [lines]);

  if (!visible || captionLines.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="w-full max-w-3xl rounded-3xl border border-white/20 bg-[#202124]/82 px-4 py-3 text-white shadow-[0_18px_50px_rgba(32,33,36,0.35)] backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
          <span>Live Captions</span>
          <span>{captionLines[captionLines.length - 1]?.isFinal ? "Synced" : "Listening"}</span>
        </div>

        <div className="space-y-2">
          {captionLines.map((line, index) => (
            <div key={line.id} className={index === captionLines.length - 1 ? "opacity-100" : "opacity-75"}>
              <span className="mr-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8ab4f8]">
                {line.speakerName}
              </span>
              <span className="text-sm leading-6 text-white sm:text-base">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}