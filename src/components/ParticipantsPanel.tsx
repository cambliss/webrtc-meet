"use client";

import Image from "next/image";

import type { Participant } from "@/src/types/meeting";
import type { SecurityAlertPayload } from "@/src/types/socket";

type ParticipantsPanelProps = {
  participants: Participant[];
  selfSocketId: string;
  isHost: boolean;
  securityAlerts: SecurityAlertPayload[];
  onAllow: (socketId: string) => void;
  onRemove: (socketId: string) => void;
  onBlockDevice: (deviceFingerprint: string) => void;
  onBlockIp: (ipAddress: string) => void;
};

export function ParticipantsPanel({
  participants,
  selfSocketId,
  isHost,
  securityAlerts,
  onAllow,
  onRemove,
  onBlockDevice,
  onBlockIp,
}: ParticipantsPanelProps) {
  const initialsFor = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#d7e4f8] bg-white shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
      <header className="border-b border-[#d7e4f8] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#202124]">Participants</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {participants.length === 0 && (
          <p className="rounded-lg border border-[#d7e4f8] bg-[#f7fbff] p-2 text-[#5f6368]">No participants yet.</p>
        )}

        {participants.map((participant) => (
          <article key={participant.socketId} className="rounded-lg border border-[#d7e4f8] bg-[#f8fbff] p-2">
            <div className="flex items-center gap-2">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#bfd6fb] bg-[#e9f2ff]">
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#1a73e8]">
                  {initialsFor(participant.username)}
                </span>
                {participant.avatarPath ? (
                  <Image
                    src={`/api/auth/avatar/${encodeURIComponent(participant.userId)}${participant.avatarVersion ? `?v=${participant.avatarVersion}` : ""}`}
                    alt={`${participant.username} avatar`}
                    width={36}
                    height={36}
                    className="relative z-10 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
              </div>
              <p className="font-semibold text-[#202124]">
                {participant.username}
                {participant.socketId === selfSocketId ? " (You)" : ""}
              </p>
            </div>
            <p className="mt-1 text-xs text-[#5f6368]">
              Invited by: {participant.invitedByName || "Direct/Unknown"}
            </p>
            <p className="mt-1 text-xs text-[#5f6368]">
              Device: {participant.deviceType || "unknown"}
              {participant.ipAddress ? ` • IP: ${participant.ipAddress}` : ""}
            </p>

            {isHost && participant.socketId !== selfSocketId && (
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  onClick={() => onRemove(participant.socketId)}
                >
                  Remove
                </button>
                {participant.deviceFingerprint && (
                  <button
                    type="button"
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                    onClick={() => onBlockDevice(participant.deviceFingerprint!)}
                  >
                    Block Device
                  </button>
                )}
                {participant.ipAddress && (
                  <button
                    type="button"
                    className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100"
                    onClick={() => onBlockIp(participant.ipAddress!)}
                  >
                    Block IP
                  </button>
                )}
              </div>
            )}
          </article>
        ))}

        {securityAlerts.length > 0 && (
          <div className="pt-2">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">Security Alerts</h3>
            <div className="space-y-2">
              {securityAlerts.slice(0, 5).map((alert) => (
                <article key={alert.id} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                  <p className="font-semibold">{alert.participantName}</p>
                  <p className="mt-1">Invited by: {alert.invitedByName || "Unknown"}</p>
                  <p>Device: {alert.deviceType || "unknown"}</p>
                  <p>IP: {alert.ipAddress || "unknown"}</p>
                  <p className="mt-1">{alert.reason}</p>
                  {isHost && alert.targetSocketId && (
                    <button
                      type="button"
                      className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      onClick={() => onAllow(alert.targetSocketId!)}
                    >
                      Allow
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
