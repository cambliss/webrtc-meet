"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BreakoutRoomsPanel } from "@/src/components/BreakoutRoomsPanel";
import { ChatPanel } from "@/src/components/ChatPanel";
import { FloatingReactions } from "@/src/components/FloatingReactions";
import { MeetingControls } from "@/src/components/MeetingControls";
import { ParticipantsPanel } from "@/src/components/ParticipantsPanel";
import { MeetingSummaryPanel } from "@/src/components/MeetingSummaryPanel";
import { RaisedHandsPanel } from "@/src/components/RaisedHandsPanel";
import {
  LANGUAGE_TO_SPEECH_LOCALE,
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

  const languagePrefix = (language: string) => {
    const locale = LANGUAGE_TO_SPEECH_LOCALE[language];
    if (!locale) {
      return "en";
    }

    return locale.split("-")[0].toLowerCase();
  };

  const router = useRouter();
  const [isMeetingEnded, setIsMeetingEnded] = useState(false);
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [transcriptLanguage, setTranscriptLanguage] = useState("original");
  const [langSearchInput, setLangSearchInput] = useState("");
  const [voiceTranslatorEnabled, setVoiceTranslatorEnabled] = useState(false);
  const [showVoicePopover, setShowVoicePopover] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakerVoicePreferencesByLanguage, setSpeakerVoicePreferencesByLanguage] = useState<
    Record<string, Record<string, string>>
  >({});
  const voicePopoverRef = useRef<HTMLDivElement | null>(null);
  // Panel visibility
  const [showBreakoutRooms, setShowBreakoutRooms] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showWebinar, setShowWebinar] = useState(false);
  const {
    localStream,
    remoteStreams,
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
    if (typeof window === "undefined") return;

    const syncVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };

    syncVoices();
    window.speechSynthesis.onvoiceschanged = syncVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("meeting-transcript-target-language");
    const storedVoiceTranslator = window.localStorage.getItem("meeting-voice-translator-enabled");
    const nextTranscriptLanguage = storedLanguage || "original";
    const storedSpeakerVoices = window.localStorage.getItem(speakerVoiceStorageKey);
    const legacySpeakerVoices = window.localStorage.getItem("meeting-speaker-voice-map");
    if (storedLanguage) {
      setTranscriptLanguage(storedLanguage);
    }
    if (storedVoiceTranslator) {
      setVoiceTranslatorEnabled(storedVoiceTranslator === "true");
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
    window.localStorage.setItem("meeting-voice-translator-enabled", String(voiceTranslatorEnabled));
  }, [voiceTranslatorEnabled]);

  useEffect(() => {
    window.localStorage.setItem(speakerVoiceStorageKey, JSON.stringify(speakerVoicePreferencesByLanguage));
  }, [speakerVoicePreferencesByLanguage]);

  // Keep the search input text in sync when transcriptLanguage changes externally (e.g. restored from localStorage).
  useEffect(() => {
    if (transcriptLanguage === "original") {
      setLangSearchInput("");
    } else {
      const option = TRANSCRIPT_LANGUAGE_OPTIONS.find((o) => o.value === transcriptLanguage);
      setLangSearchInput(option ? option.label : transcriptLanguage);
    }
  }, [transcriptLanguage]);

  const commitLangInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setTranscriptLanguage("original");
      return;
    }

    const matched = TRANSCRIPT_LANGUAGE_OPTIONS.find(
      (o) =>
        o.label.toLowerCase() === trimmed.toLowerCase() ||
        o.value.toLowerCase() === trimmed.toLowerCase(),
    );
    setTranscriptLanguage(matched ? matched.value : trimmed);
  };

  useEffect(() => {
    if (!showVoicePopover) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!voicePopoverRef.current?.contains(target)) {
        setShowVoicePopover(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showVoicePopover]);

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

  const primaryColor = branding?.primaryColor || "#06b6d4";
  const secondaryColor = branding?.secondaryColor || "#0f172a";
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

  const transcriptSpeakers = useMemo(
    () => Array.from(new Set(transcriptLines.map((line) => line.speakerName))).sort((a, b) => a.localeCompare(b)),
    [transcriptLines],
  );

  // Show waiting screen while the host hasn't admitted this participant yet.
  if (isInWaitingRoom) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top_right,#164e63,#020617_55%)] p-8 text-slate-100">
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 px-10 py-8 text-center shadow-xl">
          <div className="mb-4 text-4xl">⏳</div>
          <h1 className="mb-2 text-xl font-semibold">Waiting for the host</h1>
          <p className="text-sm text-slate-400">
            The host will admit you shortly. Please wait…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-screen grid-cols-1 gap-4 p-4 text-slate-100 lg:grid-cols-[1fr_320px]"
      style={{
        background: `radial-gradient(circle at top right, ${primaryColor}, ${secondaryColor} 55%)`,
      }}
    >
      <main className="flex min-h-[70vh] flex-col gap-4">
        <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
          <div className="flex items-center gap-3">
            <img
              src={branding?.logoUrl || "/logo.png"}
              alt={`${brandName} logo`}
              className="h-10 w-10 rounded-md border border-slate-700/70 bg-white object-contain p-1"
            />
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{brandName}</p>
              <h1 className="text-lg font-semibold">Room: {roomId}</h1>
                {isHost && (
                  <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100">
                    <span className="inline-flex h-2 w-2 rounded-full bg-amber-300" />
                    Waiting: {waitingCount}
                  </div>
                )}
            </div>
          </div>
          <p className="text-sm text-slate-300">
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-300">Listen language</span>
            <input
              list="meeting-language-datalist"
              value={langSearchInput}
              onChange={(event) => {
                const raw = event.target.value;
                setLangSearchInput(raw);
                const matched = TRANSCRIPT_LANGUAGE_OPTIONS.find(
                  (o) =>
                    o.label.toLowerCase() === raw.toLowerCase() ||
                    o.value.toLowerCase() === raw.toLowerCase(),
                );
                if (matched) {
                  setTranscriptLanguage(matched.value);
                } else if (raw === "") {
                  setTranscriptLanguage("original");
                }
              }}
              onBlur={(event) => commitLangInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search or type language…"
              className="w-44 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <datalist id="meeting-language-datalist">
              {TRANSCRIPT_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
            {transcriptLanguage !== "original" && (
              <label className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={voiceTranslatorEnabled}
                  onChange={(event) => setVoiceTranslatorEnabled(event.target.checked)}
                />
                Voice translator
              </label>
            )}
            {voiceTranslatorEnabled && transcriptLanguage !== "original" && (
              <div ref={voicePopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowVoicePopover((prev) => !prev)}
                  className="rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs text-slate-200"
                >
                  Voices
                </button>
                {showVoicePopover && (
                  <div className="absolute right-0 top-8 z-30 w-80 rounded-lg border border-slate-700 bg-slate-950/95 p-2 shadow-xl">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Voice per speaker</p>
                      <button
                        type="button"
                        onClick={() =>
                          setSpeakerVoicePreferencesByLanguage((prev) => {
                            if (!prev[transcriptLanguage]) {
                              return prev;
                            }

                            const next = { ...prev };
                            delete next[transcriptLanguage];
                            return next;
                          })
                        }
                        disabled={!speakerVoicePreferencesByLanguage[transcriptLanguage]}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-700 disabled:hover:text-slate-300"
                      >
                        Reset {transcriptLanguage}
                      </button>
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {transcriptSpeakers.length === 0 && (
                        <p className="text-[11px] text-slate-400">No speakers yet.</p>
                      )}
                      {transcriptSpeakers.map((speaker) => (
                        <label key={speaker} className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                          <span className="truncate">{speaker}</span>
                          <select
                            value={speakerVoiceByName[speaker] || "auto"}
                            onChange={(event) =>
                              setSpeakerVoicePreferencesByLanguage((prev) => ({
                                ...prev,
                                [transcriptLanguage]: {
                                  ...(prev[transcriptLanguage] || {}),
                                  [speaker]: event.target.value === "auto" ? "" : event.target.value,
                                },
                              }))
                            }
                            className="max-w-[60%] rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-100"
                          >
                            <option value="auto">Auto ({transcriptLanguage})</option>
                            {availableVoices
                              .filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix(transcriptLanguage)))
                              .map((voice) => (
                                <option key={voice.voiceURI} value={voice.voiceURI}>
                                  {voice.name} ({voice.lang})
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">Meeting link: {meetingLink}</p>

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
              className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100"
            >
              Copy My Invite Link
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
                className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100"
              >
                {isMeetingLocked ? "Unlock Meeting" : "Lock Meeting"}
              </button>
            )}

            {/* Feature toggles */}
            <button
              type="button"
              onClick={() => setShowBreakoutRooms((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showBreakoutRooms ? "border-blue-400/60 bg-blue-500/20 text-blue-100" : "border-slate-600 bg-slate-800/60 text-slate-300"}`}
            >
              Breakout
            </button>
            <button
              type="button"
              onClick={() => setShowWhiteboard((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showWhiteboard ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100" : "border-slate-600 bg-slate-800/60 text-slate-300"}`}
            >
              Whiteboard
            </button>
            <button
              type="button"
              onClick={() => setShowWebinar((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${showWebinar || webinarMode ? "border-purple-400/60 bg-purple-500/20 text-purple-100" : "border-slate-600 bg-slate-800/60 text-slate-300"}`}
            >
              Webinar{webinarMode ? " ●" : ""}
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
                  className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={isInviting}
                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-60"
                >
                  {isInviting ? "Sending..." : "Send Invite"}
                </button>
              </form>
            )}
          </div>

          {inviteStatus && <p className="mt-2 text-xs text-cyan-200">{inviteStatus}</p>}
          {isHost && (
            <p className="mt-1 text-xs text-amber-200">
              Host controls: use the Waiting Room panel on the right to admit or reject participants.
            </p>
          )}
          {!isReady && <p className="mt-1 text-xs text-amber-300">Preparing camera and microphone...</p>}
          {joinError && <p className="mt-1 text-xs text-rose-300">{joinError}</p>}
          {recordingError && <p className="mt-1 text-xs text-rose-300">Recording error: {recordingError}</p>}
          {isMeetingLocked && (
            <p className="mt-1 text-xs text-amber-300">Meeting is locked. New participants cannot join.</p>
          )}
        </header>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-52 w-52 rounded-full bg-sky-500/20 blur-3xl" />
          <FloatingReactions reactions={floatingReactions} />
          <VideoGrid
            selfParticipant={selfParticipant}
            localStream={localStream}
            remoteStreams={remoteStreams}
            raisedHands={raisedHands}
            selfSocketId={selfSocketId}
            isRecording={controls.isRecording}
          />
        </div>

        <MeetingControls
          isMicEnabled={controls.isMicEnabled}
          isCameraEnabled={controls.isCameraEnabled}
          isScreenSharing={controls.isScreenSharing}
          isBackgroundBlurEnabled={controls.isBackgroundBlurEnabled}
          isRecording={controls.isRecording}
          isHandRaised={isMyHandRaised}
          onToggleMic={controls.toggleMicrophone}
          onToggleCamera={controls.toggleCamera}
          onToggleScreenShare={controls.toggleScreenShare}
          onToggleBackgroundBlur={controls.toggleBackgroundBlur}
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
            participants={participants}
            selfSocketId={selfSocketId}
            selfUsername={me.username}
            onLowerHand={controls.lowerHand}
          />
        )}
        <ChatPanel
          roomId={roomId}
          messages={chatMessages}
          files={fileShares}
          onSendMessage={controls.sendMessage}
          onShareFile={controls.shareFile}
        />
        <TranscriptPanel
          lines={transcriptLines}
          selectedLanguage={transcriptLanguage}
          onLanguageChange={setTranscriptLanguage}
          speakTranslated={voiceTranslatorEnabled}
          onSpeakTranslatedChange={setVoiceTranslatorEnabled}
          speakerVoiceByName={speakerVoiceByName}
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
