"use client";

import { useMemo, useState } from "react";

import type { ChatMessage, MeetingFileShare } from "@/src/types/meeting";

type ChatPanelProps = {
  roomId: string;
  messages: ChatMessage[];
  files: MeetingFileShare[];
  onSendMessage: (message: string) => void;
  onShareFile: (file: File) => Promise<boolean>;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({ roomId, messages, files, onSendMessage, onShareFile }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.sentAt - b.sentAt),
    [messages],
  );

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.sharedAt - b.sharedAt),
    [files],
  );

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-700/70 bg-slate-900/80">
      <header className="border-b border-slate-700/70 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Meeting Chat</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {sortedFiles.length > 0 && (
          <section className="space-y-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">Shared Files</p>
            {sortedFiles.map((file) => (
              <article key={file.id} className="rounded-md border border-cyan-300/25 bg-slate-900/40 p-2">
                <a
                  href={`/api/meetings/${encodeURIComponent(roomId)}/files/${encodeURIComponent(file.id)}`}
                  className="text-sm font-semibold text-cyan-100 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {file.fileName}
                </a>
                <p className="mt-1 text-xs text-cyan-50/90">
                  Shared by {file.senderName} • {formatFileSize(file.fileSize)} • {new Date(file.sharedAt).toLocaleTimeString()}
                </p>
              </article>
            ))}
          </section>
        )}

        {sortedMessages.length === 0 && (
          <p className="rounded-lg bg-slate-800/60 p-2 text-slate-300">No messages yet.</p>
        )}
        {sortedMessages.map((msg) => (
          <article key={msg.id} className="rounded-lg bg-slate-800/70 p-2 text-slate-100">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
              <span>{msg.senderName}</span>
              <span>{new Date(msg.sentAt).toLocaleTimeString()}</span>
            </div>
            <p className="break-words">{msg.message}</p>
          </article>
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-slate-700/70 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) {
            return;
          }
          onSendMessage(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Send a message"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
        >
          Send
        </button>
      </form>

      <div className="border-t border-slate-700/70 p-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100">
          <span>{isUploading ? "Uploading..." : "Share File"}</span>
          <input
            type="file"
            className="hidden"
            disabled={isUploading}
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              if (!selected) {
                return;
              }

              setIsUploading(true);
              setUploadStatus("");
              const success = await onShareFile(selected);
              setUploadStatus(success ? `${selected.name} shared.` : `Failed to share ${selected.name}.`);
              setIsUploading(false);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-[11px] text-slate-400">Max file size: 100MB</p>
        {uploadStatus && <p className="mt-1 text-xs text-cyan-100">{uploadStatus}</p>}
      </div>
    </aside>
  );
}
