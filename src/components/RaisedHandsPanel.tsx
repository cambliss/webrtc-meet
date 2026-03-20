"use client";

import type { Participant } from "@/src/types/meeting";

type RaisedHandsPanelProps = {
  raisedHands: string[]; // socketIds
  participants: Participant[];
  selfSocketId: string;
  selfUsername: string;
  onLowerHand: (socketId: string) => void;
};

export function RaisedHandsPanel({
  raisedHands,
  participants,
  selfSocketId,
  selfUsername,
  onLowerHand,
}: RaisedHandsPanelProps) {
  if (raisedHands.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Raised Hands</h2>
        <p className="text-xs text-slate-400">No hands raised.</p>
      </div>
    );
  }

  // Build a lookup: socketId → display name.
  const nameFor = (socketId: string): string => {
    if (socketId === selfSocketId) return selfUsername;
    return participants.find((p) => p.socketId === socketId)?.username ?? socketId;
  };

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-slate-900/70 p-4">
      <h2 className="mb-3 text-sm font-semibold text-amber-300">
        ✋ Raised Hands ({raisedHands.length})
      </h2>
      <ul className="space-y-2">
        {raisedHands.map((socketId) => (
          <li
            key={socketId}
            className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2"
          >
            <span className="truncate text-sm text-slate-100">{nameFor(socketId)}</span>
            <button
              onClick={() => onLowerHand(socketId)}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium bg-slate-600 hover:bg-slate-500 text-white transition-colors"
            >
              Lower
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
