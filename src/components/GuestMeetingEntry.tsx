"use client";

import { useMemo, useState } from "react";

import { MeetingRoom } from "@/src/components/MeetingRoom";

type GuestMeetingEntryProps = {
  roomId: string;
  workspaceId: string;
  defaultName?: string;
  inviteToken?: string | null;
};

export function GuestMeetingEntry({
  roomId,
  workspaceId,
  defaultName = "",
  inviteToken = null,
}: GuestMeetingEntryProps) {
  const [name, setName] = useState(defaultName);
  const [joined, setJoined] = useState(false);

  const guestId = useMemo(() => {
    const randomPart =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    return `guest-${randomPart}`;
  }, []);

  const username = name.trim();

  if (joined && username.length >= 2) {
    return (
      <MeetingRoom
        roomId={roomId}
        inviteToken={inviteToken}
        me={{
          id: guestId,
          username,
          role: "participant",
          workspaceId,
        }}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,#164e63,#020617_55%)] p-4 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-xl">
        <p className="text-xs uppercase tracking-[0.14em] text-cyan-300">Guest Join</p>
        <h1 className="mt-2 text-xl font-semibold">Enter your name to join</h1>
        <p className="mt-1 text-sm text-slate-300">No signup required. The host may need to admit you from the waiting room.</p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (username.length < 2) {
              return;
            }
            setJoined(true);
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={username.length < 2}
            className="w-full rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-60"
          >
            Join Meeting
          </button>
        </form>
      </section>
    </main>
  );
}
