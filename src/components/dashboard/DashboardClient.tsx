"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import type { AuthTokenPayload } from "@/src/lib/auth";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import type { MeetingHistoryItem } from "@/src/lib/repositories/meetingSummaryRepository";

type DashboardClientProps = {
  auth: AuthTokenPayload;
  isSuperAdmin: boolean;
  history: MeetingHistoryItem[];
  dataWarning: string;
};

type NewsItem = {
  title: string;
  source: string;
  time: string;
  url: string;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function DashboardClient({ auth, isSuperAdmin, history, dataWarning }: DashboardClientProps) {
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calcInput, setCalcInput] = useState("");
  const [calcResult, setCalcResult] = useState("0");
  const [stickyNote, setStickyNote] = useState("");
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState("");
  const [secureMessages, setSecureMessages] = useState<
    Array<{
      id: string;
      senderUserId: string;
      senderName: string;
      text: string;
      createdAt: string;
      isMine: boolean;
    }>
  >([]);
  const [secureChatLoading, setSecureChatLoading] = useState(true);
  const [secureChatError, setSecureChatError] = useState("");
  const [secureMessageInput, setSecureMessageInput] = useState("");
  const [secureMessageSending, setSecureMessageSending] = useState(false);
  const [secureFiles, setSecureFiles] = useState<
    Array<{
      id: string;
      uploaderUserId: string;
      uploaderName: string;
      originalName: string;
      fileSize: number;
      mimeType: string;
      createdAt: string;
    }>
  >([]);
  const [secureFilesLoading, setSecureFilesLoading] = useState(true);
  const [secureFilesError, setSecureFilesError] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  useEffect(() => {
    const key = `oc-note-${auth.userId}`;
    const saved = window.localStorage.getItem(key);
    if (saved) {
      setStickyNote(saved);
    }
  }, [auth.userId]);

  useEffect(() => {
    const key = `oc-note-${auth.userId}`;
    window.localStorage.setItem(key, stickyNote);
  }, [auth.userId, stickyNote]);

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      try {
        setNewsError("");
        const response = await fetch("/api/news", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { items?: NewsItem[] };
        if (!response.ok) {
          throw new Error("Failed to load latest news");
        }

        if (!cancelled) {
          setNewsItems(Array.isArray(payload.items) ? payload.items.slice(0, 6) : []);
        }
      } catch {
        if (!cancelled) {
          setNewsError("Unable to load live news right now.");
          setNewsItems([]);
        }
      } finally {
        if (!cancelled) {
          setNewsLoading(false);
        }
      }
    };

    loadNews();
    const timer = window.setInterval(loadNews, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSecureMessages = async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(auth.workspaceId)}/secure-messages?limit=80`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          messages?: Array<{
            id: string;
            senderUserId: string;
            senderName: string;
            text: string;
            createdAt: string;
            isMine: boolean;
          }>;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load secure workspace messages.");
        }

        if (!cancelled) {
          setSecureMessages(Array.isArray(payload.messages) ? payload.messages : []);
          setSecureChatError("");
        }
      } catch (error) {
        if (!cancelled) {
          setSecureChatError(
            error instanceof Error ? error.message : "Unable to load secure workspace messages.",
          );
        }
      } finally {
        if (!cancelled) {
          setSecureChatLoading(false);
        }
      }
    };

    void loadSecureMessages();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadSecureMessages();
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [auth.workspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadSecureFiles = async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(auth.workspaceId)}/secure-files?limit=120`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          files?: Array<{
            id: string;
            uploaderUserId: string;
            uploaderName: string;
            originalName: string;
            fileSize: number;
            mimeType: string;
            createdAt: string;
          }>;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load shared files.");
        }

        if (!cancelled) {
          setSecureFiles(Array.isArray(payload.files) ? payload.files : []);
          setSecureFilesError("");
        }
      } catch (error) {
        if (!cancelled) {
          setSecureFilesError(error instanceof Error ? error.message : "Unable to load shared files.");
        }
      } finally {
        if (!cancelled) {
          setSecureFilesLoading(false);
        }
      }
    };

    void loadSecureFiles();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadSecureFiles();
      }
    }, 7000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [auth.workspaceId]);

  const formatFileSize = (value: number) => {
    if (value < 1024) {
      return `${value} B`;
    }

    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let unit = units[0];

    for (let i = 1; i < units.length; i += 1) {
      if (size < 1024) {
        break;
      }
      size /= 1024;
      unit = units[i];
    }

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0 || uploadingFile) {
      return;
    }

    try {
      setUploadingFile(true);
      setSecureFilesError("");

      const uploaded: Array<{
        id: string;
        uploaderUserId: string;
        uploaderName: string;
        originalName: string;
        fileSize: number;
        mimeType: string;
        createdAt: string;
      }> = [];

      for (const selected of files) {
        const formData = new FormData();
        formData.append("file", selected);

        const response = await fetch(`/api/workspaces/${encodeURIComponent(auth.workspaceId)}/secure-files`, {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          file?: {
            id: string;
            uploaderUserId: string;
            uploaderName: string;
            originalName: string;
            fileSize: number;
            mimeType: string;
            createdAt: string;
          };
        };

        if (!response.ok || !payload.file) {
          throw new Error(payload.error || `Unable to upload ${selected.name}.`);
        }

        uploaded.push(payload.file);
      }

      if (uploaded.length > 0) {
        setSecureFiles((prev) => [...uploaded, ...prev].slice(0, 300));
      }
    } catch (error) {
      setSecureFilesError(error instanceof Error ? error.message : "Unable to upload file.");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    if (selected.length === 0) {
      return;
    }

    try {
      await uploadFiles(selected);
    } finally {
      event.target.value = "";
    }
  };

  const deleteSecureFile = async (fileId: string) => {
    if (!fileId || deletingFileId) {
      return;
    }

    try {
      setDeletingFileId(fileId);
      setSecureFilesError("");

      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(auth.workspaceId)}/secure-files/${encodeURIComponent(fileId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete file.");
      }

      setSecureFiles((prev) => prev.filter((file) => file.id !== fileId));
    } catch (error) {
      setSecureFilesError(error instanceof Error ? error.message : "Unable to delete file.");
    } finally {
      setDeletingFileId(null);
    }
  };

  const sendSecureMessage = async () => {
    const text = secureMessageInput.trim();
    if (!text || secureMessageSending) {
      return;
    }

    try {
      setSecureMessageSending(true);
      setSecureChatError("");

      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(auth.workspaceId)}/secure-messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: {
          id: string;
          senderUserId: string;
          senderName: string;
          text: string;
          createdAt: string;
          isMine: boolean;
        };
      };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "Unable to send secure message.");
      }

      setSecureMessages((prev) => {
        const next = [...prev, payload.message as NonNullable<typeof payload.message>];
        return next.slice(-200);
      });
      setSecureMessageInput("");
    } catch (error) {
      setSecureChatError(error instanceof Error ? error.message : "Unable to send secure message.");
    } finally {
      setSecureMessageSending(false);
    }
  };

  const monthYear = `${monthLabels[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
  const today = new Date();
  const currentMonth = calendarDate.getMonth();
  const currentYear = calendarDate.getFullYear();
  const firstDayOffset = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDayOffset }, () => 0),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const runCalculation = () => {
    if (!calcInput.trim()) {
      setCalcResult("0");
      return;
    }

    if (!/^[0-9+\-*/().\s]+$/.test(calcInput)) {
      setCalcResult("Invalid");
      return;
    }

    try {
      const value = Function(`"use strict"; return (${calcInput})`)() as number;
      setCalcResult(Number.isFinite(value) ? String(value) : "Invalid");
    } catch {
      setCalcResult("Invalid");
    }
  };

  return (
    <DashboardShell auth={auth} isSuperAdmin={isSuperAdmin} activeItemId="overview">
        {dataWarning && (
          <section className="mb-5 rounded-2xl border border-[#f4cf6f] bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#7c5a00]">
            {dataWarning}
          </section>
        )}

        <div className="space-y-5">
          <section id="overview" className="rounded-3xl border border-[#d7e3f7] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(246,251,255,0.95)_100%)] p-6 shadow-[0_18px_34px_rgba(26,115,232,0.13)]">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-[#d9e5f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-5 shadow-[0_14px_24px_rgba(26,115,232,0.12)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Meetings summarized</p>
                <p className="mt-2 text-3xl font-bold text-[#1a73e8]">{history.length}</p>
              </article>
              <article className="rounded-2xl border border-[#d9e5f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-5 shadow-[0_14px_24px_rgba(52,168,83,0.12)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">AI recap status</p>
                <p className="mt-2 text-3xl font-bold text-[#34a853]">Active</p>
              </article>
              <article className="rounded-2xl border border-[#d9e5f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-5 shadow-[0_14px_24px_rgba(234,67,53,0.12)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Security checks</p>
                <p className="mt-2 text-3xl font-bold text-[#ea4335]">100%</p>
              </article>
              <article className="rounded-2xl border border-[#d9e5f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-5 shadow-[0_14px_24px_rgba(251,188,4,0.13)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Room readiness</p>
                <p className="mt-2 text-3xl font-bold text-[#fbbc04]">Ready</p>
              </article>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-4 shadow-[0_14px_24px_rgba(26,115,232,0.1)]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#202124]">Calendar</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                      }
                      className="rounded-lg border border-[#c8daf8] px-2 py-1 text-xs font-semibold text-[#1a73e8]"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                      }
                      className="rounded-lg border border-[#c8daf8] px-2 py-1 text-xs font-semibold text-[#1a73e8]"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-sm font-semibold text-[#5f6368]">{monthYear}</p>

                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#5f6368]">
                  {weekdayLabels.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1 text-center">
                  {calendarCells.map((day, index) => {
                    const isToday =
                      day > 0 &&
                      day === today.getDate() &&
                      currentMonth === today.getMonth() &&
                      currentYear === today.getFullYear();

                    return (
                      <span
                        key={`${day}-${index}`}
                        className={`rounded-md py-1 text-xs ${
                          day === 0
                            ? "text-transparent"
                            : isToday
                              ? "bg-[#1a73e8] font-bold text-white"
                              : "bg-[#f2f7ff] text-[#202124]"
                        }`}
                      >
                        {day || "-"}
                      </span>
                    );
                  })}
                </div>
              </article>

              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-4 shadow-[0_14px_24px_rgba(26,115,232,0.1)]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#202124]">Live News</h3>
                  <span className="text-xs font-semibold text-[#1a73e8]">Auto refresh: 60s</span>
                </div>

                {newsLoading ? (
                  <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                    Loading latest headlines...
                  </p>
                ) : newsError ? (
                  <p className="rounded-xl border border-[#f6c4bf] bg-[#fdeceb] p-3 text-sm text-[#b42318]">
                    {newsError}
                  </p>
                ) : newsItems.length === 0 ? (
                  <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                    No live headlines available.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {newsItems.map((news) => (
                      <li key={news.url} className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3">
                        <a
                          href={news.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-[#202124] hover:text-[#1a73e8]"
                        >
                          {news.title}
                        </a>
                        <p className="mt-1 text-xs text-[#5f6368]">
                          {news.source} • {news.time}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-4 shadow-[0_14px_24px_rgba(52,168,83,0.1)]">
                <h3 className="mb-3 text-base font-bold text-[#202124]">Quick Calculator</h3>
                <input
                  type="text"
                  value={calcInput}
                  onChange={(event) => setCalcInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runCalculation();
                    }
                  }}
                  placeholder="e.g. (1200+350)*3"
                  className="w-full rounded-xl border border-[#c8daf8] bg-[#f8fbff] px-3 py-2 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                />
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#5f6368]">Result: <span className="text-[#1a73e8]">{calcResult}</span></p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={runCalculation}
                      className="rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 py-1 text-xs font-semibold text-white"
                    >
                      Calculate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalcInput("");
                        setCalcResult("0");
                      }}
                      className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1a73e8]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-[#f5dd8e] bg-[linear-gradient(180deg,#fff8d9_0%,#fff3ba_100%)] p-4 shadow-[0_14px_24px_rgba(251,188,4,0.18)]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#7a5b00]">Sticky Notes</h3>
                  <button
                    type="button"
                    onClick={() => setStickyNote("")}
                    className="rounded-lg border border-[#f1c54c] bg-[#ffeaa0] px-2 py-1 text-xs font-semibold text-[#7a5b00]"
                  >
                    Clear note
                  </button>
                </div>
                <textarea
                  value={stickyNote}
                  onChange={(event) => setStickyNote(event.target.value)}
                  placeholder="Write reminders, tasks, or talking points..."
                  className="min-h-[150px] w-full resize-y rounded-xl border border-[#f0cf72] bg-[#fff9df] p-3 text-sm text-[#5b4600] outline-none focus:border-[#d1a126]"
                />
                <p className="mt-2 text-xs text-[#7a5b00]">Saved automatically in this browser.</p>
              </article>
            </div>
          </section>

          <section id="meeting-history" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Meeting History</p>
                <h2 className="mt-1 text-xl font-bold text-[#202124]">Recorded Videos</h2>
              </div>
              <Link href="/meeting-history" className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8]">
                Open Full History
              </Link>
            </div>

            {history.length === 0 ? (
              <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                No meeting history yet.
              </p>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <article key={`${item.meetingId}-${item.createdAt}`} className="rounded-2xl border border-[#d9e5f8] bg-white p-4 shadow-[0_10px_24px_rgba(26,115,232,0.08)]">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#202124]">{item.roomId}</p>
                        <p className="text-xs text-[#5f6368]">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                      <Link
                        href={`/meeting-history/${item.meetingId}`}
                        className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1a73e8]"
                      >
                        View Details
                      </Link>
                    </div>

                    {item.hasRecording ? (
                      <div className="space-y-2">
                        <video
                          controls
                          preload="metadata"
                          className="w-full rounded-xl border border-[#d9e5f8] bg-black"
                          src={`/api/meetings/${item.meetingId}/recording`}
                        >
                          Your browser does not support video playback.
                        </video>
                        <p className="text-xs text-[#5f6368]">Recording is streamed from secured workspace storage.</p>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-xs text-[#5f6368]">
                        Recording not available for this meeting.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="payments" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Billing</p>
                <h2 className="mt-1 text-xl font-bold text-[#202124]">Payments & Plans</h2>
                <p className="mt-1 text-sm text-[#5f6368]">Manage workspace subscription, invoices, and checkout actions.</p>
              </div>
              <Link
                href="/dashboard/subscription"
                className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8]"
              >
                Open Subscription Page
              </Link>
            </div>
            <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
              This section mirrors the sidebar Payments tab so navigation is consistent from every dashboard view.
            </div>
          </section>

          <section id="chat" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Workspace Chat</p>
                <h2 className="mt-1 text-xl font-bold text-[#202124]">Secure Messaging</h2>
                <p className="mt-1 text-sm text-[#5f6368]">
                  Messages are encrypted at rest and accessible only to authenticated workspace members.
                </p>
              </div>
              <span className="rounded-lg border border-[#b7e3c0] bg-[#e8f7ec] px-3 py-1 text-xs font-semibold text-[#1b7f35]">
                Privacy Mode Active
              </span>
            </div>

            <div className="rounded-2xl border border-[#d9e5f8] bg-white p-4 shadow-[0_10px_24px_rgba(26,115,232,0.08)]">
              {secureChatLoading ? (
                <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                  Loading secure messages...
                </p>
              ) : secureMessages.length === 0 ? (
                <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                  No messages yet. Start a private workspace conversation.
                </p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3">
                  {secureMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`rounded-lg border px-3 py-2 ${
                        message.isMine
                          ? "ml-8 border-[#b7e3c0] bg-[#effbf2]"
                          : "mr-8 border-[#d9e5f8] bg-white"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#202124]">
                          {message.isMine ? "You" : message.senderName}
                        </p>
                        <p className="text-[11px] text-[#5f6368]">
                          {new Date(message.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-[#202124]">{message.text}</p>
                    </article>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={secureMessageInput}
                  onChange={(event) => setSecureMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void sendSecureMessage();
                    }
                  }}
                  placeholder="Write a secure message..."
                  className="min-h-[44px] w-full resize-y rounded-xl border border-[#c8daf8] bg-[#f8fbff] px-3 py-2 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                  maxLength={2000}
                />
                <button
                  type="button"
                  onClick={() => {
                    void sendSecureMessage();
                  }}
                  disabled={secureMessageSending || !secureMessageInput.trim()}
                  className="h-11 rounded-xl border border-[#1a73e8] bg-[linear-gradient(180deg,#2d83ec_0%,#1a73e8_100%)] px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(26,115,232,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {secureMessageSending ? "Sending..." : "Send"}
                </button>
              </div>

              <p className="mt-2 text-xs text-[#5f6368]">
                Press Ctrl+Enter (or Cmd+Enter) to send quickly.
              </p>

              {secureChatError && (
                <p className="mt-2 rounded-xl border border-[#f6c4bf] bg-[#fdeceb] p-3 text-sm text-[#b42318]">
                  {secureChatError}
                </p>
              )}
            </div>
          </section>

          <section id="files" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Workspace Sharing</p>
                <h2 className="mt-1 text-xl font-bold text-[#202124]">Secure File Transfer</h2>
                <p className="mt-1 text-sm text-[#5f6368]">
                  Share documents privately with workspace members. Only authenticated users in this workspace can access files.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-xl border border-[#1a73e8] bg-[linear-gradient(180deg,#2d83ec_0%,#1a73e8_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(26,115,232,0.28)]">
                {uploadingFile ? "Uploading..." : "Upload file"}
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    void handleFileUpload(event);
                  }}
                  className="hidden"
                  disabled={uploadingFile}
                />
              </label>
            </div>

            <div
              className={`rounded-2xl border border-[#d9e5f8] bg-white p-4 shadow-[0_10px_24px_rgba(26,115,232,0.08)] ${
                isFileDropActive ? "ring-2 ring-[#1a73e8]/40" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsFileDropActive(true);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsFileDropActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsFileDropActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsFileDropActive(false);
                const dropped = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
                if (dropped.length > 0) {
                  void uploadFiles(dropped);
                }
              }}
            >
              {secureFilesLoading ? (
                <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                  Loading shared files...
                </p>
              ) : secureFiles.length === 0 ? (
                <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
                  No files shared yet. Upload one to start secure transfer.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-[#e3ebfa] bg-[#f8fbff]">
                  <ul className="divide-y divide-[#e3ebfa]">
                    {secureFiles.map((file) => (
                      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#202124]">{file.originalName}</p>
                          <p className="text-xs text-[#5f6368]">
                            Shared by {file.uploaderUserId === auth.userId ? "You" : file.uploaderName} • {formatFileSize(file.fileSize)} • {new Date(file.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <a
                          href={`/api/workspaces/${encodeURIComponent(auth.workspaceId)}/secure-files/${encodeURIComponent(file.id)}?download=1`}
                          className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1a73e8]"
                        >
                          Download
                        </a>
                        {(file.uploaderUserId === auth.userId || auth.role === "host") && (
                          <button
                            type="button"
                            onClick={() => {
                              void deleteSecureFile(file.id);
                            }}
                            disabled={deletingFileId === file.id}
                            className="rounded-lg border border-[#f3c1ba] bg-[#fdeceb] px-3 py-1 text-xs font-semibold text-[#b42318] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingFileId === file.id ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-2 text-xs text-[#5f6368]">Max file size: 25MB per file. You can drag and drop multiple files.</p>

              {secureFilesError && (
                <p className="mt-2 rounded-xl border border-[#f6c4bf] bg-[#fdeceb] p-3 text-sm text-[#b42318]">
                  {secureFilesError}
                </p>
              )}
            </div>
          </section>

          <section id="features" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Workspace</p>
              <h2 className="mt-1 text-xl font-bold text-[#202124]">Feature Controls</h2>
            </div>
            <ul className="grid gap-2 text-sm text-[#202124] sm:grid-cols-2">
              <li className="rounded-xl border border-[#d9e5f8] bg-white px-3 py-2">Secure messaging and encrypted workspace chat</li>
              <li className="rounded-xl border border-[#d9e5f8] bg-white px-3 py-2">Secure file transfer with malware webhook checks</li>
              <li className="rounded-xl border border-[#d9e5f8] bg-white px-3 py-2">AI summary, task extraction, and translation pipeline</li>
              <li className="rounded-xl border border-[#d9e5f8] bg-white px-3 py-2">Background meeting-end job processing and retries</li>
            </ul>
          </section>

          <section id="profile" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Account</p>
                <h2 className="mt-1 text-xl font-bold text-[#202124]">Profile</h2>
              </div>
              <span className="rounded-lg border border-[#d9e5f8] bg-white px-3 py-1 text-xs font-semibold text-[#5f6368]">
                {auth.username} • {auth.workspaceId}
              </span>
            </div>
            <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
              Your role is <span className="font-semibold text-[#202124]">{auth.role}</span>. Use Settings to update workspace-level configuration.
            </p>
          </section>

          <section id="settings" className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Configuration</p>
                <h2 className="mt-1 text-xl font-bold text-[#202124]">Workspace Settings</h2>
              </div>
              <Link
                href={`/workspaces/${auth.workspaceId}/settings`}
                className="rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Open Settings
              </Link>
            </div>
            <p className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-3 text-sm text-[#5f6368]">
              Domain branding, invite policy, API keys, and workspace controls are available on the dedicated settings page.
            </p>
          </section>

        </div>

        <footer className="mt-6 flex justify-center rounded-2xl border border-[#d8e5fa] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(245,250,255,0.92)_100%)] p-4 shadow-[0_12px_20px_rgba(26,115,232,0.1)]">
          <Image
            src="/logo.png"
            alt="Brand logo"
            width={72}
            height={72}
            className="rounded-2xl border border-[#d3e3fd] bg-white object-contain p-1"
          />
        </footer>
    </DashboardShell>
  );
}
