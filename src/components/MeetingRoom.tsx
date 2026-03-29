"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BreakoutRoomsPanel } from "@/src/components/BreakoutRoomsPanel";
import { ChatPanel } from "@/src/components/ChatPanel";
import { FloatingReactions } from "@/src/components/FloatingReactions";
import { LiveCaptionsOverlay } from "@/src/components/LiveCaptionsOverlay";
import { MeetingControls } from "@/src/components/MeetingControls";
import { ParticipantsPanel } from "@/src/components/ParticipantsPanel";
import { MeetingSummaryPanel } from "@/src/components/MeetingSummaryPanel";
import { RaisedHandsPanel } from "@/src/components/RaisedHandsPanel";
import {
  TranscriptPanel,
  TRANSCRIPT_LANGUAGE_OPTIONS,
} from "@/src/components/TranscriptPanel";
import { VideoGrid } from "@/src/components/VideoGrid";
import { WaitingRoomPanel } from "@/src/components/WaitingRoomPanel";
import { WebinarPanel } from "@/src/components/WebinarPanel";
import { WhiteboardPanel } from "@/src/components/WhiteboardPanel";
import { useWebRTC } from "@/src/hooks/useWebRTC";
import type { AppUser } from "@/src/types/auth";

type MeetingRoomProps = {
  roomId: string;
  me: AppUser;
  inviteToken?: string | null;
};

type WorkspaceBranding = {
  brandName: string;
  logoUrl: string | null;
  customDomain: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

export function MeetingRoom({ roomId, me, inviteToken = null }: MeetingRoomProps) {
  const speakerVoiceStorageKey = "meeting-speaker-voice-map-by-language";

  const router = useRouter();
  const [isMeetingEnded, setIsMeetingEnded] = useState(false);
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true);
  const [calendarInviteLoading, setCalendarInviteLoading] = useState(false);
  const [gmailInviteLoading, setGmailInviteLoading] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [avatarSpeakerModeEnabled, setAvatarSpeakerModeEnabled] = useState(false);
  const [transcriptLanguage, setTranscriptLanguage] = useState("original");
  const [voiceTranslatorEnabled, setVoiceTranslatorEnabled] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [speakerVoicePreferencesByLanguage, setSpeakerVoicePreferencesByLanguage] = useState<
    Record<string, Record<string, string>>
  >({});
  // Panel visibility
  const [showBreakoutRooms, setShowBreakoutRooms] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showWebinar, setShowWebinar] = useState(false);
  const {
    localStream,
    remoteStreams,
    activeSpeakerSocketId,
    chatMessages,
    fileShares,
    transcriptLines,
    selfParticipant,
    controls,
    isReady,
    isInWaitingRoom,
    waitingRoom,
    raisedHands,
    floatingReactions,
    joinError,
    recordingError,
    securityAlerts,
    isMeetingLocked,
    selfSocketId,
    participants,
    breakoutRooms,
    assignedBreakoutRoom,
    whiteboardElements,
    whiteboardCursors,
    webinarMode,
    presenterSocketIds,
    isAttendee,
    typingParticipantNames,
    emotionBySocketId,
  } =
    useWebRTC({ roomId, me, inviteToken });

  const isHost = (selfParticipant?.role || me.role) === "host";

  const isMyHandRaised = selfSocketId ? raisedHands.includes(selfSocketId) : false;
  const waitingCount = waitingRoom.length;
  const speakerVoiceByName = useMemo(
    () => speakerVoicePreferencesByLanguage[transcriptLanguage] || {},
    [speakerVoicePreferencesByLanguage, transcriptLanguage],
  );

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("meeting-transcript-target-language");
    const storedVoiceTranslator = window.localStorage.getItem("meeting-voice-translator-enabled");
    const storedAvatarSpeakerMode = window.localStorage.getItem("meeting-avatar-speaker-mode-enabled");
    const storedCaptionsPreference = window.localStorage.getItem("meeting-live-captions-visible");
    const nextTranscriptLanguage = storedLanguage || "original";
    const storedSpeakerVoices = window.localStorage.getItem(speakerVoiceStorageKey);
    const legacySpeakerVoices = window.localStorage.getItem("meeting-speaker-voice-map");
    if (storedLanguage) {
      setTranscriptLanguage(storedLanguage);
    }
    if (storedVoiceTranslator) {
      setVoiceTranslatorEnabled(storedVoiceTranslator === "true");
    }
    if (storedAvatarSpeakerMode) {
      setAvatarSpeakerModeEnabled(storedAvatarSpeakerMode === "true");
    }
    if (storedCaptionsPreference) {
      setShowCaptions(storedCaptionsPreference === "true");
    }
    if (storedSpeakerVoices) {
      try {
        const parsed = JSON.parse(storedSpeakerVoices) as Record<string, Record<string, string>>;
        setSpeakerVoicePreferencesByLanguage(parsed);
      } catch {
        // Ignore corrupted local speaker voice preferences.
      }
    } else if (legacySpeakerVoices) {
      try {
        const parsed = JSON.parse(legacySpeakerVoices) as Record<string, string>;
        setSpeakerVoicePreferencesByLanguage({ [nextTranscriptLanguage]: parsed });
      } catch {
        // Ignore corrupted legacy speaker voice preferences.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("meeting-transcript-target-language", transcriptLanguage);
  }, [transcriptLanguage]);

  useEffect(() => {
    window.localStorage.setItem("meeting-live-captions-visible", String(showCaptions));
  }, [showCaptions]);

  useEffect(() => {
    window.localStorage.setItem("meeting-voice-translator-enabled", String(voiceTranslatorEnabled));
  }, [voiceTranslatorEnabled]);

  useEffect(() => {
    window.localStorage.setItem(
      "meeting-avatar-speaker-mode-enabled",
      String(avatarSpeakerModeEnabled),
    );
  }, [avatarSpeakerModeEnabled]);

  useEffect(() => {
    window.localStorage.setItem(speakerVoiceStorageKey, JSON.stringify(speakerVoicePreferencesByLanguage));
  }, [speakerVoicePreferencesByLanguage]);

  useEffect(() => {
    if (!controls.isRecording) {
      setRecordingElapsedSeconds(0);
      return;
    }

    setRecordingElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setRecordingElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [controls.isRecording]);

  // Start emotion detection automatically when room is ready
  useEffect(() => {
    if (isReady && controls.startEmotionDetection) {
      controls.startEmotionDetection();
    }
  }, [isReady, controls]);

  const recordingTimerLabel = useMemo(() => {
    const minutes = Math.floor(recordingElapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (recordingElapsedSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [recordingElapsedSeconds]);

  async function persistMeetingEnd(recordingPath: string | null) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      await fetch("/api/meetings/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          transcriptLines,
          chatMessages,
          fileShares,
          recordingPath,
        }),
        signal: controller.signal,
      });
    } catch {
      // Ignore persistence failures here so the user can still leave the meeting.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  useEffect(() => {
    if (me.id.startsWith("guest-")) {
      return;
    }

    let mounted = true;

    fetch(`/api/workspaces/${me.workspaceId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { workspace?: { brandName?: string; logoUrl?: string | null; customDomain?: string | null; primaryColor?: string | null; secondaryColor?: string | null; name?: string } }) => {
        if (!mounted || !payload.workspace) {
          return;
        }

        setBranding({
          brandName: payload.workspace.brandName || payload.workspace.name || "MeetFlow Conference",
          logoUrl: payload.workspace.logoUrl || null,
          customDomain: payload.workspace.customDomain || null,
          primaryColor: payload.workspace.primaryColor || null,
          secondaryColor: payload.workspace.secondaryColor || null,
        });
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [me.workspaceId]);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const calendarState = params.get("calendar");
    const calendarReason = params.get("reason");
    if (calendarState === "connected") {
      setInviteStatus("Google Calendar and Gmail connected.");
    } else if (calendarState === "error") {
      setInviteStatus(
        calendarReason ? `Google connection failed: ${calendarReason}.` : "Google connection failed.",
      );
    }

    const loadGoogleStatus = async () => {
      try {
        setGoogleStatusLoading(true);
        const response = await fetch("/api/integrations/google/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          connected?: boolean;
        };

        if (!cancelled && response.ok) {
          setGoogleConnected(Boolean(payload.connected));
        }
      } catch {
        if (!cancelled) {
          setGoogleConnected(false);
        }
      } finally {
        if (!cancelled) {
          setGoogleStatusLoading(false);
        }
      }
    };

    void loadGoogleStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryColor = branding?.primaryColor || "#06b6d4";
  const secondaryColor = branding?.secondaryColor || "#1a73e8";
  const brandName = branding?.brandName || "MeetFlow Conference";

  const meetingLink = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (inviteToken) {
      return `${origin}/meeting/${roomId}?invite=${encodeURIComponent(inviteToken)}`;
    }
    return `${origin}/meeting/${roomId}`;
  }, [inviteToken, roomId]);

  const participantList = useMemo(() => {
    if (!selfParticipant) {
      return participants;
    }

    return [
      {
        ...selfParticipant,
        socketId: selfSocketId || "local",
      },
      ...participants,
    ];
  }, [participants, selfParticipant, selfSocketId]);
  const avatarPathByUserId = useMemo(() => {
    const entries: Record<string, string | null | undefined> = {};

    for (const participant of participantList) {
      entries[participant.userId] = participant.avatarPath;
    }

    return entries;
  }, [participantList]);
  const avatarVersionByUserId = useMemo(() => {
    const entries: Record<string, number | null | undefined> = {};

    for (const participant of participantList) {
      entries[participant.userId] = participant.avatarVersion;
    }

    return entries;
  }, [participantList]);
  const speakerAvatarPathBySocketId = useMemo(() => {
    const entries: Record<string, string | null | undefined> = {};

    for (const participant of participantList) {
      entries[participant.socketId] = participant.avatarPath;
    }

    return entries;
  }, [participantList]);
  const speakerAvatarVersionBySocketId = useMemo(() => {
    const entries: Record<string, number | null | undefined> = {};

    for (const participant of participantList) {
      entries[participant.socketId] = participant.avatarVersion;
    }

    return entries;
  }, [participantList]);
  const speakerUserIdBySocketId = useMemo(() => {
    const entries: Record<string, string | null | undefined> = {};

    for (const participant of participantList) {
      entries[participant.socketId] = participant.userId;
    }

    return entries;
  }, [participantList]);

  // Show waiting screen while the host hasn't admitted this participant yet.
  if (isInWaitingRoom) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top_right,#dbeafe,#eff6ff_50%,#ffffff)] p-8 text-[#202124]">
        <div className="rounded-2xl border border-[#d7e4f8] bg-white/95 px-10 py-8 text-center shadow-[0_18px_34px_rgba(26,115,232,0.12)]">
          <div className="mb-4 text-4xl">⏳</div>
          <h1 className="mb-2 text-xl font-semibold">Waiting for the host</h1>
          <p className="text-sm text-[#5f6368]">
            The host will admit you shortly. Please wait…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-screen grid-cols-1 gap-4 bg-[radial-gradient(circle_at_top_right,#dbeafe,#eff6ff_45%,#ffffff)] p-4 text-[#202124] lg:grid-cols-[1fr_320px]"
      style={{
        background: `radial-gradient(circle at top right, #e6f0ff 0%, #f5f9ff 40%, #ffffff 100%)`,
      }}
    >
      <main className="flex min-h-[70vh] flex-col gap-4">
        <header className="rounded-2xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-4 shadow-[0_14px_26px_rgba(26,115,232,0.1)]">
          <div className="flex items-center gap-3">
            <img
              src={branding?.logoUrl || "/logo.png"}
              alt={`${brandName} logo`}
              className="h-10 w-10 rounded-md border border-[#d7e4f8] bg-white object-contain p-1"
            />
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#5f6368]">{brandName}</p>
              <h1 className="text-lg font-semibold">Room: {roomId}</h1>
                {isHost && (
                  <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-[#d7e4f8] bg-[#eef4ff] px-2.5 py-1 text-xs font-semibold text-[#1a73e8]">
                    <span className="inline-flex h-2 w-2 rounded-full bg-[#1a73e8]" />
                    Waiting: {waitingCount}
                  </div>
                )}
            </div>
          </div>
          <p className="text-sm text-[#5f6368]">
            Signed in as {me.username} ({me.role})
          </p>
          {controls.isRecording && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-rose-300/40 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-100">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-rose-300" />
              Recording {recordingTimerLabel}
            </div>
          )}
          {webinarMode && (
            <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-purple-300/40 bg-purple-500/15 px-2.5 py-1 text-xs font-semibold text-purple-100">
              <span className="inline-flex h-2 w-2 rounded-full bg-purple-300" />
              {isAttendee ? "Webinar — Viewer" : "Webinar — Presenter"}
            </div>
          )}
          {assignedBreakoutRoom && (
            <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-blue-300/40 bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-100">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-300" />
              {assignedBreakoutRoom.breakoutRoomName}
            </div>
          )}
          <p className="mt-1 text-xs text-[#5f6368]">Meeting link: {meetingLink}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await fetch(`/api/meetings/${encodeURIComponent(roomId)}/invites`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      parentInviteToken: inviteToken || undefined,
                    }),
                  });

                  const payload = (await response.json().catch(() => ({}))) as {
                    joinLink?: string;
                    error?: string;
                  };

                  if (!response.ok || !payload.joinLink) {
                    throw new Error(payload.error || "Failed to create invite link");
                  }

                  await navigator.clipboard.writeText(payload.joinLink);
                  setInviteStatus("Your unique invite link copied.");
                } catch {
                  setInviteStatus("Unable to copy link. Copy manually from above.");
                }
              }}
              className="rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8]"
            >
              Copy My Invite Link
            </button>

            {isHost && (
              <button
                type="button"
                disabled={googleStatusLoading}
                onClick={async () => {
                  if (googleConnected) {
                    try {
                      setGoogleStatusLoading(true);
                      const response = await fetch("/api/integrations/google/disconnect", {
                        method: "POST",
                      });
                      if (!response.ok) {
                        throw new Error("Unable to disconnect Google integration.");
                      }

                      setGoogleConnected(false);
                      setInviteStatus("Google Calendar and Gmail disconnected.");
                    } catch (error) {
                      setInviteStatus(
                        error instanceof Error ? error.message : "Unable to disconnect Google integration.",
                      );
                    } finally {
                      setGoogleStatusLoading(false);
                    }
                    return;
                  }

                  const nextPath = `/meeting/${encodeURIComponent(roomId)}${
                    inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ""
                  }`;
                  window.location.href = `/api/integrations/google/connect?next=${encodeURIComponent(nextPath)}`;
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  googleConnected
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-[#c8daf8] bg-[#eef4ff] text-[#1a73e8]"
                } disabled:opacity-60`}
              >
                {googleStatusLoading
                  ? "Checking Google..."
                  : googleConnected
                    ? "Disconnect Google"
                    : "Connect Google"
                }
              </button>
            )}

            <button
              type="button"
              disabled={calendarInviteLoading}
              onClick={async () => {
                try {
                  setCalendarInviteLoading(true);
                  const response = await fetch("/api/integrations/calendar/invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      meetingLink,
                      title: `${brandName} meeting: ${roomId}`,
                      startIso: new Date().toISOString(),
                      endIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                    }),
                  });
                  const payload = (await response.json().catch(() => ({}))) as {
                    error?: string;
                    calendarDeeplink?: string;
                    serverEventUrl?: string | null;
                  };

                  if (!response.ok) {
                    throw new Error(payload.error || "Unable to open calendar invite.");
                  }

                  const targetUrl = payload.serverEventUrl || payload.calendarDeeplink;
                  if (!targetUrl) {
                    throw new Error("Calendar invite link was not returned.");
                  }

                  window.open(targetUrl, "_blank", "noopener,noreferrer");
                  setInviteStatus(
                    payload.serverEventUrl
                      ? "Calendar event created in your Google account."
                      : "Google Calendar invite opened in a new tab.",
                  );
                } catch (error) {
                  setInviteStatus(
                    error instanceof Error ? error.message : "Unable to open calendar invite.",
                  );
                } finally {
                  setCalendarInviteLoading(false);
                }
              }}
              className="rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8] disabled:opacity-60"
            >
              {calendarInviteLoading ? "Opening Calendar..." : "Add to Calendar"}
            </button>

            {isHost && (
              <button
                type="button"
                onClick={() => {
                  controls.applyHostSecurityAction({
                    action: isMeetingLocked ? "unlock" : "lock",
                    reason: isMeetingLocked ? "Meeting unlocked by host" : "Meeting locked by host",
                  });
                }}
                className="rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8]"
              >
                {isMeetingLocked ? "Unlock Meeting" : "Lock Meeting"}
              </button>
            )}

            {/* Feature toggles */}
            <button
              type="button"
              onClick={() => setShowBreakoutRooms((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showBreakoutRooms ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8]" : "border-[#d7e4f8] bg-white text-[#5f6368]"}`}
            >
              Breakout
            </button>
            <button
              type="button"
              onClick={() => setShowWhiteboard((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showWhiteboard ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8]" : "border-[#d7e4f8] bg-white text-[#5f6368]"}`}
            >
              Whiteboard
            </button>
            <button
              type="button"
              onClick={() => setShowWebinar((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showWebinar || webinarMode ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8]" : "border-[#d7e4f8] bg-white text-[#5f6368]"}`}
            >
              Webinar{webinarMode ? " ●" : ""}
            </button>
            <button
              type="button"
              onClick={() => setShowCaptions((current) => !current)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showCaptions ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8]" : "border-[#d7e4f8] bg-white text-[#5f6368]"}`}
            >
              Captions
            </button>

            {isHost && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const email = inviteEmail.trim();
                  if (!email) {
                    setInviteStatus("Enter an email to send invite.");
                    return;
                  }

                  try {
                    setIsInviting(true);
                    setInviteStatus("");

                    const response = await fetch(`/api/workspaces/${me.workspaceId}/invite`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, role: "member" }),
                    });

                    const payload = (await response.json().catch(() => ({}))) as {
                      error?: string;
                    };

                    if (!response.ok) {
                      throw new Error(payload.error || "Failed to send invite");
                    }

                    setInviteEmail("");
                    setInviteStatus("Invite sent. Admitted users can join from waiting room.");
                  } catch (error) {
                    setInviteStatus(error instanceof Error ? error.message : "Failed to send invite");
                  } finally {
                    setIsInviting(false);
                  }
                }}
              >
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="Invite by email"
                  className="rounded-lg border border-[#c8daf8] bg-white px-3 py-1.5 text-xs text-[#202124] outline-none focus:border-[#1a73e8]"
                />
                <button
                  type="submit"
                  disabled={isInviting}
                  className="rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8] disabled:opacity-60"
                >
                  {isInviting ? "Sending..." : "Send Invite"}
                </button>
                <button
                  type="button"
                  disabled={gmailInviteLoading}
                  onClick={async () => {
                    const email = inviteEmail.trim();
                    if (!email) {
                      setInviteStatus("Enter an email to send a Gmail invite.");
                      return;
                    }

                    try {
                      setGmailInviteLoading(true);
                      const response = await fetch("/api/integrations/gmail/invite", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: email,
                          meetingLink,
                          title: `${brandName} meeting invite`,
                          message: `Join ${brandName} in room ${roomId}.`,
                        }),
                      });
                      const payload = (await response.json().catch(() => ({}))) as {
                        error?: string;
                        mailtoUrl?: string;
                        gmailSent?: boolean;
                      };

                      if (!response.ok) {
                        throw new Error(payload.error || "Failed to send Gmail invite.");
                      }

                      if (payload.gmailSent) {
                        setInviteStatus("Invite sent via Gmail.");
                      } else if (payload.mailtoUrl) {
                        window.location.href = payload.mailtoUrl;
                        setInviteStatus(
                          googleConnected
                            ? "Gmail send was unavailable. Opened your mail app instead."
                            : "Connect Google to send from Gmail directly. Mail app opened as fallback.",
                        );
                      } else {
                        setInviteStatus("Invite prepared, but no mail client fallback was available.");
                      }
                    } catch (error) {
                      setInviteStatus(error instanceof Error ? error.message : "Failed to send Gmail invite.");
                    } finally {
                      setGmailInviteLoading(false);
                    }
                  }}
                  className="rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8] disabled:opacity-60"
                >
                  {gmailInviteLoading ? "Sending Gmail..." : "Send via Gmail"}
                </button>
              </form>
            )}
          </div>

          {inviteStatus && <p className="mt-2 text-xs text-[#1a73e8]">{inviteStatus}</p>}
          {isHost && (
            <p className="mt-1 text-xs text-[#c26401]">
              Host controls: use the Waiting Room panel on the right to admit or reject participants.
            </p>
          )}
          {!isReady && <p className="mt-1 text-xs text-[#c26401]">Preparing camera and microphone...</p>}
          {joinError && <p className="mt-1 text-xs text-rose-700">{joinError}</p>}
          {recordingError && <p className="mt-1 text-xs text-rose-700">Recording error: {recordingError}</p>}
          {controls.pendingRecordingUploads > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5f6368]">
              <span>
                {controls.pendingRecordingUploads} recording
                {controls.pendingRecordingUploads === 1 ? " is" : "s are"} queued for offline sync.
              </span>
              <button
                type="button"
                disabled={controls.isSyncingRecordings}
                onClick={() => {
                  void controls.syncPendingRecordings();
                }}
                className="rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-2 py-1 font-semibold text-[#1a73e8] disabled:opacity-60"
              >
                {controls.isSyncingRecordings ? "Syncing..." : "Retry Sync"}
              </button>
            </div>
          )}
          {isMeetingLocked && (
            <p className="mt-1 text-xs text-[#c26401]">Meeting is locked. New participants cannot join.</p>
          )}
        </header>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[#93c5fd]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-52 w-52 rounded-full bg-[#60a5fa]/20 blur-3xl" />
          <FloatingReactions reactions={floatingReactions} />
          <VideoGrid
            selfParticipant={selfParticipant}
            localStream={localStream}
            remoteStreams={remoteStreams}
            raisedHands={raisedHands}
            selfSocketId={selfSocketId}
            isRecording={controls.isRecording}
            activeSpeakerSocketId={activeSpeakerSocketId}
            avatarSpeakerMode={avatarSpeakerModeEnabled}
            emotionBySocketId={emotionBySocketId}
          />
          <LiveCaptionsOverlay lines={transcriptLines} visible={showCaptions} />
        </div>

        <MeetingControls
          isMicEnabled={controls.isMicEnabled}
          isCameraEnabled={controls.isCameraEnabled}
          isScreenSharing={controls.isScreenSharing}
          isBackgroundBlurEnabled={controls.isBackgroundBlurEnabled}
          isNoiseSuppressionEnabled={controls.isNoiseSuppressionEnabled}
          isAvatarSpeakerModeEnabled={avatarSpeakerModeEnabled}
          isRecording={controls.isRecording}
          isHandRaised={isMyHandRaised}
          listenLanguage={transcriptLanguage}
          listenLanguageOptions={TRANSCRIPT_LANGUAGE_OPTIONS}
          isVoiceTranslatorEnabled={voiceTranslatorEnabled}
          onToggleMic={controls.toggleMicrophone}
          onToggleCamera={controls.toggleCamera}
          onToggleScreenShare={controls.toggleScreenShare}
          onToggleBackgroundBlur={controls.toggleBackgroundBlur}
          onToggleNoiseSuppression={controls.toggleNoiseSuppression}
          onToggleAvatarSpeakerMode={() => setAvatarSpeakerModeEnabled((current) => !current)}
          onChangeListenLanguage={setTranscriptLanguage}
          onToggleVoiceTranslator={() => setVoiceTranslatorEnabled((current) => !current)}
          onToggleRecording={() => {
            if (controls.isRecording) {
              controls.stopRecording();
              return;
            }
            controls.startRecording();
          }}
          onToggleHand={() => {
            if (isMyHandRaised && selfSocketId) {
              controls.lowerHand(selfSocketId);
            } else {
              controls.raiseHand();
            }
          }}
          onSendReaction={controls.sendReaction}
          onLeave={async () => {
            setIsMeetingEnded(true);

            let recordingPath = controls.recordingPath || null;
            if (controls.isRecording) {
              recordingPath = await controls.stopRecording();
            }

            await persistMeetingEnd(recordingPath);

            controls.leaveRoom();
            router.push("/meeting-history");
          }}
          isLowBandwidthMode={controls.isLowBandwidthMode}
          onToggleLowBandwidth={controls.toggleLowBandwidthMode}
          isVoiceControlEnabled={controls.isVoiceControlEnabled}
          lastVoiceCommand={controls.lastVoiceCommand}
          onToggleVoiceControl={controls.toggleVoiceControl}
          isAutoFrameEnabled={controls.isAutoFrameEnabled}
          onToggleAutoFrame={controls.toggleAutoFrame}
        />
      </main>

      <aside className="grid min-h-[40vh] grid-cols-1 gap-4 lg:grid-rows-3">
        <ParticipantsPanel
          participants={participantList}
          selfSocketId={selfSocketId}
          isHost={isHost}
          securityAlerts={securityAlerts}
          onAllow={(targetSocketId) => {
            controls.applyHostSecurityAction({
              action: "allow",
              targetSocketId,
              reason: "Allowed by host from security alert",
            });
          }}
          onRemove={(targetSocketId) => {
            controls.applyHostSecurityAction({
              action: "remove",
              targetSocketId,
              reason: "Removed by host",
            });
          }}
          onBlockDevice={(targetDeviceFingerprint) => {
            controls.applyHostSecurityAction({
              action: "block_device",
              targetDeviceFingerprint,
              reason: "Blocked by host",
            });
          }}
          onBlockIp={(targetIpAddress) => {
            controls.applyHostSecurityAction({
              action: "block_ip",
              targetIpAddress,
              reason: "Blocked by host",
            });
          }}
        />
        {isHost && (
          <WaitingRoomPanel
            waiting={waitingRoom}
            onAdmit={controls.admitParticipant}
            onReject={controls.rejectParticipant}
          />
        )}
        {isHost && (
          <RaisedHandsPanel
            raisedHands={raisedHands}
            participants={participantList}
            selfSocketId={selfSocketId}
            selfUsername={me.username}
            onLowerHand={controls.lowerHand}
          />
        )}
        <ChatPanel
          roomId={roomId}
          currentUserId={me.id}
          currentUserName={me.username}
          messages={chatMessages}
          files={fileShares}
          onSendMessage={controls.sendMessage}
          onAddReaction={controls.addReactionToMessage}
          onEditMessage={controls.editOwnMessage}
          onDeleteMessage={controls.deleteOwnMessage}
          onPinMessage={controls.togglePinMessage}
          onTypingChange={controls.setChatTyping}
          onShareFile={controls.shareFile}
          onMarkMessageSeen={controls.markMessageSeen}
          typingParticipantNames={typingParticipantNames}
          avatarPathByUserId={avatarPathByUserId}
          avatarVersionByUserId={avatarVersionByUserId}
        />
        <TranscriptPanel
          lines={transcriptLines}
          activeSpeakerSocketId={activeSpeakerSocketId}
          selectedLanguage={transcriptLanguage}
          onLanguageChange={setTranscriptLanguage}
          speakTranslated={voiceTranslatorEnabled}
          onSpeakTranslatedChange={setVoiceTranslatorEnabled}
          speakerVoiceByName={speakerVoiceByName}
          speakerAvatarPathBySocketId={speakerAvatarPathBySocketId}
          speakerAvatarVersionBySocketId={speakerAvatarVersionBySocketId}
          speakerUserIdBySocketId={speakerUserIdBySocketId}
          showControls={false}
        />
        <MeetingSummaryPanel transcriptLines={transcriptLines} isMeetingEnded={isMeetingEnded} />
      </aside>

      {/* ── Breakout Rooms panel ── */}
      {showBreakoutRooms && (
        <div className="fixed inset-y-0 right-0 z-40 flex shadow-2xl">
          <BreakoutRoomsPanel
            isHost={isHost}
            breakoutRooms={breakoutRooms}
            participants={participantList}
            assignedBreakoutRoom={assignedBreakoutRoom}
            selfSocketId={selfSocketId}
            onCreateRooms={controls.createBreakoutRooms}
            onAssign={controls.assignToBreakout}
            onClose={controls.closeBreakoutRooms}
            onDismiss={() => setShowBreakoutRooms(false)}
          />
        </div>
      )}

      {/* ── Whiteboard overlay ── */}
      {showWhiteboard && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-stretch">
          <WhiteboardPanel
            elements={whiteboardElements}
            cursors={whiteboardCursors}
            selfSocketId={selfSocketId}
            selfName={me.username}
            isHost={isHost}
            onAddElement={controls.addWhiteboardElement}
            onUpdateElement={controls.updateWhiteboardElement}
            onDeleteElement={controls.deleteWhiteboardElement}
            onClear={controls.clearWhiteboard}
            onReplaceElements={controls.replaceWhiteboardElements}
            onCursorMove={controls.updateWhiteboardCursor}
            onDismiss={() => setShowWhiteboard(false)}
          />
        </div>
      )}

      {/* ── Webinar panel ── */}
      {showWebinar && (
        <div className="fixed inset-y-0 right-0 z-40 flex shadow-2xl">
          <WebinarPanel
            isHost={isHost}
            webinarMode={webinarMode}
            presenterSocketIds={presenterSocketIds}
            participants={participantList}
            selfSocketId={selfSocketId}
            onSetWebinarMode={controls.setWebinarMode}
            onPromote={controls.promoteToPresenter}
            onDemote={controls.demoteToAttendee}
            onDismiss={() => setShowWebinar(false)}
          />
        </div>
      )}
    </div>
  );
}
