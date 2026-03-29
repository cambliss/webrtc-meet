"use client";

import Image from "next/image";

import type { WaitingRoomParticipant } from "@/src/types/socket";

type WaitingRoomPanelProps = {
  waiting: WaitingRoomParticipant[];
  onAdmit: (socketId: string) => void;
  onReject: (socketId: string) => void;
};

export function WaitingRoomPanel({ waiting, onAdmit, onReject }: WaitingRoomPanelProps) {
  const initialsFor = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  if (waiting.length === 0) {
    return (
      <div className="rounded-2xl border border-[#d7e4f8] bg-white p-4 shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
        <h2 className="mb-2 text-sm font-semibold text-[#202124]">Waiting Room</h2>
        <p className="text-xs text-[#5f6368]">No participants waiting.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#c8daf8] bg-[#f7fbff] p-4 shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
      <h2 className="mb-3 text-sm font-semibold text-[#1a73e8]">
        Waiting Room ({waiting.length})
      </h2>
      <ul className="space-y-2">
        {waiting.map((participant) => (
          <li
            key={participant.socketId}
            className="flex items-center justify-between gap-2 rounded-lg border border-[#d7e4f8] bg-white px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#bfd6fb] bg-[#e9f2ff]">
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#1a73e8]">
                  {initialsFor(participant.username)}
                </span>
                {participant.avatarPath ? (
                  <Image
                    src={`/api/auth/avatar/${encodeURIComponent(participant.userId)}${participant.avatarVersion ? `?v=${participant.avatarVersion}` : ""}`}
                    alt={`${participant.username} avatar`}
                    width={32}
                    height={32}
                    className="relative z-10 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
              </div>
              <span className="truncate text-sm text-[#202124]">{participant.username}</span>
            </div>
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
