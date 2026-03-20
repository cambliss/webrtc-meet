"use client";

import type { Participant } from "@/src/types/meeting";

interface WebinarPanelProps {
  isHost: boolean;
  webinarMode: boolean;
  presenterSocketIds: string[];
  participants: Participant[];
  selfSocketId: string;
  onSetWebinarMode: (enabled: boolean) => void;
  onPromote: (socketId: string) => void;
  onDemote: (socketId: string) => void;
  onDismiss: () => void;
}

export function WebinarPanel({
  isHost,
  webinarMode,
  presenterSocketIds,
  participants,
  selfSocketId,
  onSetWebinarMode,
  onPromote,
  onDemote,
  onDismiss,
}: WebinarPanelProps) {
  const presenters = participants.filter(
    (p) => p.socketId === selfSocketId ? false : presenterSocketIds.includes(p.socketId),
  );
  const attendees = participants.filter(
    (p) => p.socketId !== selfSocketId && !presenterSocketIds.includes(p.socketId) && p.role !== "host",
  );
  const attendeeCount = attendees.length;

  return (
    <aside className="flex h-full w-80 flex-col bg-zinc-900 text-white">
      <header className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
        <h2 className="text-sm font-semibold">Webinar Mode</h2>
        <button onClick={onDismiss} className="rounded p-1 hover:bg-zinc-700" aria-label="Close panel">
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Status banner */}
        <div
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            webinarMode ? "bg-purple-900/60 text-purple-200" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {webinarMode ? "● Webinar mode is active" : "Webinar mode is off"}
        </div>

        {/* Host toggle */}
        {isHost && (
          <button
            onClick={() => onSetWebinarMode(!webinarMode)}
            className={`w-full rounded px-3 py-2 text-sm font-medium ${
              webinarMode
                ? "bg-red-700 hover:bg-red-800"
                : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            {webinarMode ? "Disable Webinar Mode" : "Enable Webinar Mode"}
          </button>
        )}

        {webinarMode && (
          <>
            {/* Presenters */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Presenters ({presenters.length})
              </h3>
              {presenters.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No presenters yet.</p>
              ) : (
                <ul className="space-y-1">
                  {presenters.map((p) => (
                    <li
                      key={p.socketId}
                      className="flex items-center justify-between rounded bg-zinc-800 px-3 py-1.5"
                    >
                      <span className="text-xs text-zinc-200">{p.username}</span>
                      {isHost && (
                        <button
                          onClick={() => onDemote(p.socketId)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Demote
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Attendees */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Attendees ({attendeeCount})
              </h3>
              {attendees.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No attendees yet.</p>
              ) : (
                <ul className="space-y-1">
                  {attendees.map((p) => (
                    <li
                      key={p.socketId}
                      className="flex items-center justify-between rounded bg-zinc-800 px-3 py-1.5"
                    >
                      <span className="text-xs text-zinc-200">{p.username}</span>
                      {isHost && (
                        <button
                          onClick={() => onPromote(p.socketId)}
                          className="text-xs text-green-400 hover:underline"
                        >
                          Make Presenter
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* View-only indicator for attendees */}
        {!isHost && webinarMode && !presenterSocketIds.includes(selfSocketId) && (
          <div className="rounded-lg border border-purple-700 bg-purple-900/30 p-3 text-center">
            <p className="text-sm font-medium text-purple-300">You are viewing this webinar</p>
            <p className="mt-1 text-xs text-zinc-400">
              Raise your hand to request presenter access.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
