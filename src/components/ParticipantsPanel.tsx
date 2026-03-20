"use client";

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
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-700/70 bg-slate-900/80">
      <header className="border-b border-slate-700/70 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Participants</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {participants.length === 0 && (
          <p className="rounded-lg bg-slate-800/60 p-2 text-slate-300">No participants yet.</p>
        )}

        {participants.map((participant) => (
          <article key={participant.socketId} className="rounded-lg border border-slate-700/70 bg-slate-800/60 p-2">
            <p className="font-semibold text-slate-100">
              {participant.username}
              {participant.socketId === selfSocketId ? " (You)" : ""}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Invited by: {participant.invitedByName || "Direct/Unknown"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Device: {participant.deviceType || "unknown"}
              {participant.ipAddress ? ` • IP: ${participant.ipAddress}` : ""}
            </p>

            {isHost && participant.socketId !== selfSocketId && (
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded border border-rose-400/50 bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-100"
                  onClick={() => onRemove(participant.socketId)}
                >
                  Remove
                </button>
                {participant.deviceFingerprint && (
                  <button
                    type="button"
                    className="rounded border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-100"
                    onClick={() => onBlockDevice(participant.deviceFingerprint!)}
                  >
                    Block Device
                  </button>
                )}
                {participant.ipAddress && (
                  <button
                    type="button"
                    className="rounded border border-orange-400/50 bg-orange-500/15 px-2 py-1 text-[11px] font-semibold text-orange-100"
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-200">Security Alerts</h3>
            <div className="space-y-2">
              {securityAlerts.slice(0, 5).map((alert) => (
                <article key={alert.id} className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-100">
                  <p className="font-semibold">{alert.participantName}</p>
                  <p className="mt-1">Invited by: {alert.invitedByName || "Unknown"}</p>
                  <p>Device: {alert.deviceType || "unknown"}</p>
                  <p>IP: {alert.ipAddress || "unknown"}</p>
                  <p className="mt-1">{alert.reason}</p>
                  {isHost && alert.targetSocketId && (
                    <button
                      type="button"
                      className="mt-2 rounded border border-emerald-300/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-100"
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
