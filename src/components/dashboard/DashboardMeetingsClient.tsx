"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { JoinMeetingForm } from "@/src/components/JoinMeetingForm";
import type { AuthTokenPayload } from "@/src/lib/auth";

type DashboardMeetingsClientProps = {
  auth: AuthTokenPayload;
  isSuperAdmin: boolean;
};

type DashboardMeetingItem = {
  id: string;
  roomId: string;
  title: string;
  status: "scheduled" | "live" | "ended" | string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

export function DashboardMeetingsClient({ auth, isSuperAdmin }: DashboardMeetingsClientProps) {
  const [meetings, setMeetings] = useState<DashboardMeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadMeetings = async () => {
      try {
        setError("");
        const res = await fetch("/api/meetings?limit=20", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as {
          meetings?: DashboardMeetingItem[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(payload.error || "Failed to load meetings");
        }

        if (!cancelled) {
          setMeetings(Array.isArray(payload.meetings) ? payload.meetings : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load meetings");
          setMeetings([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMeetings();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [meetings],
  );

  const badgeClass = (status: string) => {
    if (status === "live") {
      return "border-[#b7e3c0] bg-[#e8f7ec] text-[#1b7f35]";
    }

    if (status === "scheduled") {
      return "border-[#c8daf8] bg-[#eef4ff] text-[#1a73e8]";
    }

    return "border-[#d8dde6] bg-[#f4f6f9] text-[#5f6368]";
  };

  return (
    <DashboardShell auth={auth} isSuperAdmin={isSuperAdmin} activeItemId="meetings">
        <section className="rounded-3xl border border-[#d7e3f7] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(246,251,255,0.95)_100%)] p-6 shadow-[0_18px_34px_rgba(26,115,232,0.13)]">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Quick Actions</p>
            <h2 className="mt-1 text-xl font-bold text-[#202124]">Create or Join Meeting</h2>
            <p className="mt-1 text-sm text-[#5f6368]">Instant launch, schedule for later, or join by code/link from one clean tab.</p>
          </div>
          <JoinMeetingForm canCreateHostMeetings={auth.role === "host"} />
        </section>

        <section className="mt-5 rounded-3xl border border-[#d7e3f7] bg-white p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-[#202124]">Recent Meetings</h2>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1a73e8]"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-[#5f6368]">Loading meetings...</p>
          ) : error ? (
            <p className="rounded-xl border border-[#f5b4af] bg-[#fde8e6] px-3 py-2 text-sm text-[#b42318]">{error}</p>
          ) : sortedMeetings.length === 0 ? (
            <p className="text-sm text-[#5f6368]">No meetings yet. Create your first meeting above.</p>
          ) : (
            <ul className="space-y-3">
              {sortedMeetings.map((meeting) => (
                <li key={meeting.id} className="rounded-xl border border-[#e0e8f5] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[#202124]">{meeting.title}</p>
                      <p className="mt-1 text-xs text-[#5f6368]">Code: {meeting.roomId} • Created {new Date(meeting.createdAt).toLocaleString()}</p>
                    </div>
                    <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${badgeClass(meeting.status)}`}>
                      {meeting.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/meeting/${meeting.roomId}`}
                      className="rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 py-1 text-xs font-semibold text-white"
                    >
                      Open Room
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        const link = `${window.location.origin}/meeting/${meeting.roomId}`;
                        await navigator.clipboard.writeText(link);
                      }}
                      className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1a73e8]"
                    >
                      Copy Link
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
    </DashboardShell>
  );
}
