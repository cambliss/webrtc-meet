"use client";

import type { WaitingRoomParticipant } from "@/src/types/socket";

type WaitingRoomPanelProps = {
  waiting: WaitingRoomParticipant[];
  onAdmit: (socketId: string) => void;
  onReject: (socketId: string) => void;
};

export function WaitingRoomPanel({ waiting, onAdmit, onReject }: WaitingRoomPanelProps) {
  if (waiting.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Waiting Room</h2>
        <p className="text-xs text-slate-400">No participants waiting.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-slate-900/70 p-4">
      <h2 className="mb-3 text-sm font-semibold text-amber-300">
        Waiting Room ({waiting.length})
      </h2>
      <ul className="space-y-2">
        {waiting.map((participant) => (
          <li
            key={participant.socketId}
            className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2"
          >
            <span className="truncate text-sm text-slate-100">{participant.username}</span>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => onAdmit(participant.socketId)}
                className="rounded px-2 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Admit
              </button>
              <button
                onClick={() => onReject(participant.socketId)}
                className="rounded px-2 py-1 text-xs font-medium bg-rose-700 hover:bg-rose-600 text-white transition-colors"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
