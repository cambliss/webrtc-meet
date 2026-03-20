"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type JoinMeetingFormProps = {
  canCreateHostMeetings: boolean;
};

export function JoinMeetingForm({ canCreateHostMeetings }: JoinMeetingFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"instant" | "later" | "join">("instant");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [formError, setFormError] = useState("");
  const [scheduledResult, setScheduledResult] = useState<{
    joinCode: string;
    joinLink: string;
    scheduledFor?: string | null;
  } | null>(null);

  const parseMeetingDestination = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.includes("/meeting/")) {
      const match = trimmed.match(/\/meeting\/([^/?#]+)/i);
      const code = match?.[1] || "";
      if (!code) {
        return "";
      }

      const inviteMatch = trimmed.match(/[?&]invite=([^&#]+)/i);
      if (inviteMatch?.[1]) {
        return `/meeting/${code}?invite=${encodeURIComponent(decodeURIComponent(inviteMatch[1]))}`;
      }

      return `/meeting/${code}`;
    }

    return `/meeting/${trimmed}`;
  };

  const createMeeting = async (mode: "instant" | "scheduled") => {
    setFormError("");
    setScheduledResult(null);

    const loadingSetter = mode === "instant" ? setIsCreating : setIsScheduling;

    try {
      loadingSetter(true);
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle.trim() || undefined,
          mode,
          scheduledFor: mode === "scheduled" ? scheduledFor || undefined : undefined,
        }),
      });

      const data = (await response.json()) as {
        meetingId?: string;
        roomCode?: string;
        joinCode?: string;
        joinLink?: string;
        scheduledFor?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to create meeting");
      }

      const code = data.joinCode || data.roomCode || data.meetingId;
      if (!code) {
        throw new Error("Meeting code is missing");
      }

      if (mode === "instant") {
        router.push(`/meeting/${code}`);
        return;
      }

      setScheduledResult({
        joinCode: code,
        joinLink: data.joinLink || `${window.location.origin}/meeting/${code}`,
        scheduledFor: data.scheduledFor || null,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create meeting");
    } finally {
      loadingSetter(false);
    }
  };

  return (
    <section className="oc-join-card w-full">
      <h2 className="oc-join-title">Meeting Launcher</h2>
      <p className="oc-join-sub">Start instantly, schedule for later, or join with a code/link.</p>

      <div className="mb-3 inline-flex rounded-xl border border-[#c8daf8] bg-[#eef4ff] p-1">
        <button
          type="button"
          onClick={() => setActiveTab("instant")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === "instant" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"
          }`}
        >
          Instant
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("later")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === "later" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"
          }`}
        >
          For Later
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("join")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === "join" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"
          }`}
        >
          Join
        </button>
      </div>

      {activeTab !== "join" && (
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
          Meeting Title
          <input
            value={meetingTitle}
            onChange={(event) => setMeetingTitle(event.target.value)}
            placeholder={activeTab === "instant" ? "Quick sync" : "Planning session"}
            className="oc-join-input mt-2"
          />
        </label>
      )}

      {activeTab === "instant" && (
        <div className="oc-join-actions">
          <button
            type="button"
            disabled={isCreating || !canCreateHostMeetings}
            className="oc-btn oc-btn-primary"
            onClick={() => createMeeting("instant")}
          >
            {isCreating ? "Creating..." : "Create & Open Meeting"}
          </button>
        </div>
      )}

      {activeTab === "later" && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
            Schedule Date & Time
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              className="oc-join-input mt-2"
            />
          </label>

          <div className="oc-join-actions">
            <button
              type="button"
              disabled={isScheduling || !canCreateHostMeetings}
              className="oc-btn oc-btn-secondary"
              onClick={() => createMeeting("scheduled")}
            >
              {isScheduling ? "Scheduling..." : "Schedule Meeting"}
            </button>
          </div>

          {scheduledResult && (
            <div className="rounded-xl border border-[#c8daf8] bg-[#f4f8ff] p-3 text-sm text-[#202124]">
              <p className="font-semibold text-[#1a73e8]">Meeting scheduled</p>
              <p className="mt-1">Code: {scheduledResult.joinCode}</p>
              <p className="mt-1 break-all">Link: {scheduledResult.joinLink}</p>
              {scheduledResult.scheduledFor && (
                <p className="mt-1 text-xs text-[#5f6368]">
                  Scheduled for: {new Date(scheduledResult.scheduledFor).toLocaleString()}
                </p>
              )}
              <button
                type="button"
                className="oc-btn oc-btn-primary mt-3"
                onClick={() => router.push(`/meeting/${scheduledResult.joinCode}`)}
              >
                Open Meeting Room
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "join" && (
        <form
          className="oc-join-form"
          onSubmit={(event) => {
            event.preventDefault();
            const destination = parseMeetingDestination(joinInput);
            if (!destination) {
              setFormError("Enter a meeting code or link.");
              return;
            }

            setFormError("");
            router.push(destination);
          }}
        >
          <input
            value={joinInput}
            onChange={(event) => setJoinInput(event.target.value)}
            placeholder="Paste meeting code or full meeting link"
            className="oc-join-input"
          />
          <div className="oc-join-actions">
            <button type="submit" className="oc-btn oc-btn-primary">
              Join Meeting
            </button>
          </div>
        </form>
      )}

      {!canCreateHostMeetings && activeTab !== "join" && (
        <p className="mt-3 text-xs text-[#b3261e]">You need host access to create meetings.</p>
      )}

      {formError && <p className="mt-3 text-xs text-[#b3261e]">{formError}</p>}
    </section>
  );
}
