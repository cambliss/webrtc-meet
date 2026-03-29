"use client";

import Image from "next/image";

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
      <div className="rounded-2xl border border-[#d7e4f8] bg-white p-4 shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
        <h2 className="mb-2 text-sm font-semibold text-[#202124]">Raised Hands</h2>
        <p className="text-xs text-[#5f6368]">No hands raised.</p>
      </div>
    );
  }

  const participantFor = (socketId: string): Participant | undefined =>
    participants.find((participant) => participant.socketId === socketId);

  const nameFor = (socketId: string): string => {
    if (socketId === selfSocketId) return selfUsername;
    return participantFor(socketId)?.username ?? socketId;
  };

  const initialsFor = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="rounded-2xl border border-[#c8daf8] bg-[#f7fbff] p-4 shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
      <h2 className="mb-3 text-sm font-semibold text-[#1a73e8]">
        ✋ Raised Hands ({raisedHands.length})
      </h2>
      <ul className="space-y-2">
        {raisedHands.map((socketId) => {
          const participant = participantFor(socketId);
          const displayName = nameFor(socketId);

          return (
            <li key={socketId} className="flex items-center justify-between gap-2 rounded-lg border border-[#d7e4f8] bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#bfd6fb] bg-[#e9f2ff]">
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#1a73e8]">
                    {initialsFor(displayName)}
                  </span>
                  {participant?.avatarPath ? (
                    <Image
                      src={`/api/auth/avatar/${encodeURIComponent(participant.userId)}${participant.avatarVersion ? `?v=${participant.avatarVersion}` : ""}`}
                      alt={`${displayName} avatar`}
                      width={32}
                      height={32}
                      className="relative z-10 h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </div>
                <span className="truncate text-sm text-[#202124]">{displayName}</span>
              </div>
              <button
                onClick={() => onLowerHand(socketId)}
                className="shrink-0 rounded border border-[#c8daf8] bg-[#eef4ff] px-2 py-1 text-xs font-medium text-[#1a73e8] transition-colors hover:bg-[#dce9ff]"
              >
                Lower
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
