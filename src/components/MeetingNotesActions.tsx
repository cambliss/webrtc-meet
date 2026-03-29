"use client";

import { useState } from "react";

type MeetingNotesActionsProps = {
  exportText: string;
  fileName: string;
};

export function MeetingNotesActions({ exportText, fileName }: MeetingNotesActionsProps) {
  const [status, setStatus] = useState("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setStatus("Notes copied.");
    } catch {
      setStatus("Copy failed.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    setStatus("Notes downloaded.");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        className="rounded-md border border-[#d7e4f8] bg-white px-2 py-1 text-xs font-semibold text-[#5f6368]"
      >
        Copy Notes
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="rounded-md border border-[#d7e4f8] bg-white px-2 py-1 text-xs font-semibold text-[#5f6368]"
      >
        Export
      </button>
      {status ? <span className="text-xs text-[#5f6368]">{status}</span> : null}
    </div>
  );
}