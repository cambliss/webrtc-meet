"use client";

import { useCallback, useEffect, useState } from "react";

type Session = {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
};

type LoginAttempt = {
  id: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  browserName: string | null;
  osName: string | null;
  deviceType: string | null;
  createdAt: string;
};

type SessionsData = {
  currentSessionId: string | null;
  activeSessions: Session[];
  loginHistory: Session[];
  loginAttempts: LoginAttempt[];
};

function deviceIcon(type: string) {
  if (type === "mobile") return "📱";
  if (type === "tablet") return "📟";
  return "💻";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function DeviceLabel({ session }: { session: Session | LoginAttempt }) {
  const parts = [session.browserName, session.osName].filter(Boolean);
  return (
    <span className="text-[#202124]">
      {parts.length > 0 ? parts.join(" · ") : "Unknown browser"}
    </span>
  );
}

export function SessionsClient({ initialData }: { initialData: SessionsData }) {
  const [data, setData] = useState<SessionsData>(initialData);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [tab, setTab] = useState<"active" | "history" | "attempts">("active");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      if (res.ok) setData(await res.json());
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const revokeOne = async (sessionId: string) => {
    setRevoking(sessionId);
    setError(null);
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Failed to revoke session");
      } else {
        await refresh();
      }
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("This will log out all other devices. Continue?")) return;
    setRevokingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sessions", { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to revoke all sessions");
      } else {
        await refresh();
      }
    } finally {
      setRevokingAll(false);
    }
  };

  const otherActiveSessions = data.activeSessions.filter((s) => s.id !== data.currentSessionId);
  const currentSession = data.activeSessions.find((s) => s.id === data.currentSessionId);

  return (
    <div className="space-y-6">
      {/* Current session banner */}
      {currentSession && (
        <div className="flex items-start gap-4 rounded-2xl border border-[#c8f7c5] bg-[#f2fff1] p-4">
          <span className="text-2xl">{deviceIcon(currentSession.deviceType)}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#34a853] px-2.5 py-0.5 text-xs font-semibold text-white">
                ✓ Current session
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#202124]">
              <DeviceLabel session={currentSession} />
            </p>
            <p className="text-xs text-[#5f6368]">
              IP: {currentSession.ipAddress ?? "—"} · Active {relativeTime(currentSession.lastActiveAt)}
            </p>
          </div>
        </div>
      )}

      {/* Revoke all */}
      {otherActiveSessions.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-[#fce8e6] bg-[#fff8f8] px-4 py-3">
          <p className="text-sm text-[#d93025]">
            {otherActiveSessions.length} other active {otherActiveSessions.length === 1 ? "session" : "sessions"} detected
          </p>
          <button
            type="button"
            disabled={revokingAll}
            onClick={revokeAll}
            className="rounded-xl bg-[#d93025] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#b3261e] disabled:opacity-50"
          >
            {revokingAll ? "Logging out…" : "Logout all other devices"}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#fce8e6] bg-[#fff8f8] px-4 py-3 text-sm text-[#d93025]">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-[#d7e3f7] bg-[#f7faff] p-1">
        {(["active", "history", "attempts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              tab === t
                ? "bg-white shadow-sm text-[#1a73e8]"
                : "text-[#5f6368] hover:text-[#202124]"
            }`}
          >
            {{
              active: `Active Sessions (${data.activeSessions.length})`,
              history: `Login History (${data.loginHistory.length})`,
              attempts: `Login Attempts (${data.loginAttempts.length})`,
            }[t]}
          </button>
        ))}
      </div>

      {/* Active Sessions */}
      {tab === "active" && (
        <div className="space-y-3">
          {data.activeSessions.length === 0 && (
            <p className="py-8 text-center text-sm text-[#5f6368]">No active sessions found.</p>
          )}
          {data.activeSessions.map((session) => {
            const isCurrent = session.id === data.currentSessionId;
            return (
              <div
                key={session.id}
                className={`flex items-start gap-4 rounded-2xl border p-4 transition ${
                  isCurrent
                    ? "border-[#c8f7c5] bg-[#f2fff1]"
                    : "border-[#d7e3f7] bg-white hover:border-[#aac8f4]"
                }`}
              >
                <span className="mt-0.5 text-2xl">{deviceIcon(session.deviceType)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#202124]">
                      <DeviceLabel session={session} />
                    </p>
                    {isCurrent && (
                      <span className="rounded-full bg-[#34a853] px-2 py-0.5 text-[11px] font-semibold text-white">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#5f6368]">
                    IP: {session.ipAddress ?? "—"} · {session.deviceType}
                  </p>
                  <p className="text-xs text-[#5f6368]">
                    Signed in {formatDate(session.createdAt)} · Last active {relativeTime(session.lastActiveAt)}
                  </p>
                </div>
                {!isCurrent && (
                  <button
                    type="button"
                    disabled={revoking === session.id}
                    onClick={() => revokeOne(session.id)}
                    className="flex-shrink-0 rounded-xl border border-[#fce8e6] bg-white px-3 py-1.5 text-xs font-semibold text-[#d93025] transition hover:bg-[#fce8e6] disabled:opacity-50"
                  >
                    {revoking === session.id ? "…" : "Log out"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Login History */}
      {tab === "history" && (
        <div className="overflow-x-auto rounded-2xl border border-[#d9e5f8]">
          <table className="min-w-full divide-y divide-[#eef3fc] text-left text-sm">
            <thead className="bg-[#f7faff] text-xs uppercase tracking-wide text-[#5f6368]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Device</th>
                <th className="px-4 py-2.5 font-semibold">IP Address</th>
                <th className="px-4 py-2.5 font-semibold">Signed In</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef3fc] bg-white">
              {data.loginHistory.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#5f6368]">
                    No login history yet.
                  </td>
                </tr>
              )}
              {data.loginHistory.map((s) => (
                <tr key={s.id} className="align-middle">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span>{deviceIcon(s.deviceType)}</span>
                      <DeviceLabel session={s} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[#5f6368]">{s.ipAddress ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[#5f6368] whitespace-nowrap">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.revokedAt ? (
                      <span className="inline-flex rounded-full border border-[#dadce0] bg-[#f1f3f4] px-2 py-0.5 text-[11px] font-semibold text-[#5f6368]">
                        Ended
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[#34a853] px-2 py-0.5 text-[11px] font-semibold text-white">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Login Attempts */}
      {tab === "attempts" && (
        <div className="overflow-x-auto rounded-2xl border border-[#d9e5f8]">
          <table className="min-w-full divide-y divide-[#eef3fc] text-left text-sm">
            <thead className="bg-[#f7faff] text-xs uppercase tracking-wide text-[#5f6368]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Time</th>
                <th className="px-4 py-2.5 font-semibold">Result</th>
                <th className="px-4 py-2.5 font-semibold">Device / Browser</th>
                <th className="px-4 py-2.5 font-semibold">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef3fc] bg-white">
              {data.loginAttempts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#5f6368]">
                    No login attempts recorded.
                  </td>
                </tr>
              )}
              {data.loginAttempts.map((a) => (
                <tr key={a.id} className="align-middle">
                  <td className="px-4 py-2.5 whitespace-nowrap text-[#5f6368]">
                    {formatDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.success ? (
                      <span className="inline-flex rounded-full bg-[#34a853] px-2 py-0.5 text-[11px] font-semibold text-white">
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[#ea4335] px-2 py-0.5 text-[11px] font-semibold text-white" title={a.failureReason ?? ""}>
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#202124]">
                    {[a.browserName, a.osName].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[#5f6368]">{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
