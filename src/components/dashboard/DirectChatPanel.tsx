"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthTokenPayload } from "@/src/lib/auth";

type User = {
  id: string;
  name: string;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
  createdAt: string;
};

type Conversation = {
  userId: string;
  userName: string;
  userEmail: string;
  userDisplayName: string | null;
  userAvatarPath: string | null;
  lastActivityAt: string | null;
  unreadCount: number;
};

type DirectMessage = {
  kind: "message";
  id: string;
  senderUserId: string;
  recipientUserId: string;
  senderName: string;
  text: string;
  isRead: boolean;
  isMine: boolean;
  createdAt: string;
};

type DirectFile = {
  kind: "file";
  id: string;
  senderUserId: string;
  recipientUserId: string;
  senderName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  isRead: boolean;
  isMine: boolean;
  createdAt: string;
};

type TimelineItem = DirectMessage | DirectFile;

type DirectChatPanelProps = {
  auth: AuthTokenPayload;
  workspaceId: string;
  mode?: "chat" | "files" | "all";
  title?: string;
  subtitle?: string;
  className?: string;
};

const CONVERSATIONS_POLL_INTERVAL_MS = 15000;
const TIMELINE_POLL_INTERVAL_MS = 10000;

function isDirectMessagePayload(value: unknown): value is Omit<DirectMessage, "kind"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.senderUserId === "string" &&
    typeof candidate.recipientUserId === "string" &&
    typeof candidate.senderName === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.isRead === "boolean" &&
    typeof candidate.isMine === "boolean" &&
    typeof candidate.createdAt === "string"
  );
}

function isDirectFilePayload(value: unknown): value is Omit<DirectFile, "kind"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.senderUserId === "string" &&
    typeof candidate.recipientUserId === "string" &&
    typeof candidate.senderName === "string" &&
    typeof candidate.originalName === "string" &&
    typeof candidate.fileSize === "number" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.isRead === "boolean" &&
    typeof candidate.isMine === "boolean" &&
    typeof candidate.createdAt === "string"
  );
}

function buildTimeline(messages: DirectMessage[], files: DirectFile[], mode: "chat" | "files" | "all") {
  if (mode === "chat") {
    return messages;
  }

  if (mode === "files") {
    return files;
  }

  return [...messages, ...files].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
}

function isWindowActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function areMessagesEqual(left: DirectMessage[], right: DirectMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (
      leftItem.id !== rightItem.id ||
      leftItem.isRead !== rightItem.isRead ||
      leftItem.createdAt !== rightItem.createdAt ||
      leftItem.text !== rightItem.text
    ) {
      return false;
    }
  }

  return true;
}

function areFilesEqual(left: DirectFile[], right: DirectFile[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (
      leftItem.id !== rightItem.id ||
      leftItem.isRead !== rightItem.isRead ||
      leftItem.createdAt !== rightItem.createdAt
    ) {
      return false;
    }
  }

  return true;
}

export function DirectChatPanel({
  auth,
  workspaceId,
  mode = "all",
  title = "Chat & Files",
  subtitle = "Direct messages with workspace members",
  className = "min-h-[70vh]",
}: DirectChatPanelProps) {
  const [view, setView] = useState<"conversations" | "users">("users");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [files, setFiles] = useState<DirectFile[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const conversationsPrimedRef = useRef(false);
  const timelinePrimedRef = useRef(false);
  const conversationsInFlightRef = useRef(false);
  const timelineInFlightRef = useRef(false);
  const timelineLengthRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const loadConversations = async () => {
      if (conversationsInFlightRef.current) {
        return;
      }

      const showLoader = !conversationsPrimedRef.current;
      conversationsInFlightRef.current = true;

      try {
        if (showLoader) {
          setLoadingConversations(true);
        }
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages/conversations`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          conversations?: Conversation[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load conversations");
        }

        if (!cancelled) {
          const nextConversations = Array.isArray(payload.conversations) ? payload.conversations : [];
          setConversations((current) => {
            if (
              current.length === nextConversations.length &&
              current.every((item, index) => {
                const nextItem = nextConversations[index];
                return (
                  item.userId === nextItem.userId &&
                  item.lastActivityAt === nextItem.lastActivityAt &&
                  item.unreadCount === nextItem.unreadCount
                );
              })
            ) {
              return current;
            }

            return nextConversations;
          });
          if (nextConversations.length > 0) {
            setSelectedUserId((current) => current ?? nextConversations[0].userId);
          }
          conversationsPrimedRef.current = true;
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load conversations");
        }
      } finally {
        conversationsInFlightRef.current = false;
        if (!cancelled && showLoader) {
          setLoadingConversations(false);
        }
      }
    };

    void loadConversations();
    const intervalId = window.setInterval(() => {
      if (isWindowActive()) {
        void loadConversations();
      }
    }, CONVERSATIONS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [workspaceId]);

  useEffect(() => {
    const timelineLength = messages.length + files.length;
    if (timelineLength <= timelineLengthRef.current) {
      return;
    }

    timelineLengthRef.current = timelineLength;
    const viewport = timelineViewportRef.current;
    if (!viewport) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom < 96) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [files.length, messages.length]);

  useEffect(() => {
    if (!selectedUserId) {
      setMessages([]);
      setFiles([]);
      timelinePrimedRef.current = false;
      return;
    }

    let cancelled = false;
    timelinePrimedRef.current = false;

    const loadTimeline = async () => {
      if (timelineInFlightRef.current) {
        return;
      }

      const showLoader = !timelinePrimedRef.current;
      timelineInFlightRef.current = true;

      try {
        if (showLoader) {
          setLoadingTimeline(true);
        }

        const [messagesResponse, filesResponse] = await Promise.all([
          fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages/${encodeURIComponent(selectedUserId)}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/direct-message-files/${encodeURIComponent(selectedUserId)}`,
            { cache: "no-store" },
          ),
        ]);

        const messagesPayload = (await messagesResponse.json().catch(() => ({}))) as {
          messages?: Array<Omit<DirectMessage, "kind">>;
          error?: string;
        };
        const filesPayload = (await filesResponse.json().catch(() => ({}))) as {
          files?: Array<Omit<DirectFile, "kind">>;
          error?: string;
        };

        if (!messagesResponse.ok) {
          throw new Error(messagesPayload.error || "Unable to load messages");
        }

        if (!filesResponse.ok) {
          throw new Error(filesPayload.error || "Unable to load files");
        }

        if (!cancelled) {
          const nextMessages = (Array.isArray(messagesPayload.messages) ? messagesPayload.messages : []).map(
            (item) => ({
              ...item,
              kind: "message" as const,
            }),
          );
          const nextFiles = (Array.isArray(filesPayload.files) ? filesPayload.files : []).map((item) => ({
            ...item,
            kind: "file" as const,
          }));

          setMessages((current) => (areMessagesEqual(current, nextMessages) ? current : nextMessages));
          setFiles((current) => (areFilesEqual(current, nextFiles) ? current : nextFiles));
          timelinePrimedRef.current = true;
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load conversation");
        }
      } finally {
        timelineInFlightRef.current = false;
        if (!cancelled && showLoader) {
          setLoadingTimeline(false);
        }
      }
    };

    void loadTimeline();
    const intervalId = window.setInterval(() => {
      if (isWindowActive()) {
        void loadTimeline();
      }
    }, TIMELINE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedUserId, workspaceId]);

  const loadAllUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/users`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        users?: User[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load users");
      }

      setAllUsers(Array.isArray(payload.users) ? payload.users : []);
      setView("users");
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    void loadAllUsers();
  }, [workspaceId]);

  const sendMessage = async () => {
    const text = messageInput.trim();
    if (!selectedUserId || !text || sendingMessage) {
      return;
    }

    try {
      setSendingMessage(true);
      setError("");

      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages/${encodeURIComponent(selectedUserId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        message?: unknown;
        error?: string;
      };

      if (!response.ok || !isDirectMessagePayload(payload.message)) {
        throw new Error(payload.error || "Unable to send message");
      }

      const message: DirectMessage = { ...payload.message, kind: "message" };
      setMessages((current) => [...current, message]);
      setMessageInput("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!selectedUserId || !file) {
      return;
    }

    try {
      setUploadingFile(true);
      setError("");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/direct-message-files/${encodeURIComponent(selectedUserId)}`,
        {
          method: "POST",
          body: formData,
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        file?: unknown;
        error?: string;
      };

      if (!response.ok || !isDirectFilePayload(payload.file)) {
        throw new Error(payload.error || "Unable to upload file");
      }

      const uploadedFile: DirectFile = { ...payload.file, kind: "file" };
      setFiles((current) => [...current, uploadedFile]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload file");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const selectedConversation = selectedUserId
    ? conversations.find((item) => item.userId === selectedUserId) || null
    : null;
  const selectedWorkspaceUser = selectedUserId
    ? allUsers.find((item) => item.id === selectedUserId) || null
    : null;

  const selectedUserLabel =
    selectedConversation?.userDisplayName ||
    selectedConversation?.userName ||
    selectedWorkspaceUser?.displayName ||
    selectedWorkspaceUser?.name ||
    "Select a user";

  const selectedUserEmail =
    selectedConversation?.userEmail || selectedWorkspaceUser?.email || "";

  const timeline = useMemo(
    () => buildTimeline(messages, files, mode),
    [files, messages, mode],
  );

  const showMessageComposer = mode !== "files";
  const showFileUpload = true;

  return (
    <section className={`overflow-hidden rounded-3xl border border-[#d7e4f8] bg-white shadow-[0_16px_30px_rgba(26,115,232,0.08)] ${className}`}>
      <div className="border-b border-[#d7e3f7] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5">
        <h2 className="text-xl font-bold text-[#202124]">{title}</h2>
        <p className="mt-1 text-sm text-[#5f6368]">{subtitle}</p>
      </div>

      <div className="flex gap-2 border-b border-[#d7e3f7] px-5 py-3">
        <button
          type="button"
          onClick={() => setView("conversations")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            view === "conversations"
              ? "bg-[#1a73e8] text-white"
              : "bg-[#eef4ff] text-[#1a73e8] hover:bg-[#dce9ff]"
          }`}
        >
          Recent
        </button>
        <button
          type="button"
          onClick={() => void loadAllUsers()}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            view === "users"
              ? "bg-[#1a73e8] text-white"
              : "bg-[#eef4ff] text-[#1a73e8] hover:bg-[#dce9ff]"
          }`}
        >
          All Users
        </button>
      </div>

      {error && (
        <div className="border-b border-[#f6c4bf] bg-[#fdeceb] px-5 py-3 text-sm text-[#b42318]">{error}</div>
      )}

      <div className="flex min-h-[55vh]">
        <div className="w-64 shrink-0 overflow-y-auto border-r border-[#d7e3f7] bg-[#fbfdff]">
          {view === "conversations" ? (
            loadingConversations ? (
              <div className="p-4 text-sm text-[#5f6368]">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="space-y-3 p-4 text-sm text-[#5f6368]">
                <p>No conversations yet.</p>
                <button
                  type="button"
                  onClick={() => void loadAllUsers()}
                  className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8] hover:bg-[#dce9ff]"
                >
                  Browse all users
                </button>
              </div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.userId}
                  type="button"
                  onClick={() => setSelectedUserId(conversation.userId)}
                  className={`flex w-full items-start gap-3 border-b border-[#e8ebf5] px-4 py-3 text-left hover:bg-[#f0f4f9] ${
                    selectedUserId === conversation.userId ? "bg-[#eef4ff]" : ""
                  }`}
                >
                  {conversation.userAvatarPath ? (
                    <Image
                      src={`/api/auth/avatar/${encodeURIComponent(conversation.userId)}`}
                      alt={conversation.userName}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a73e8] text-xs font-bold text-white">
                      {conversation.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#202124]">
                      {conversation.userDisplayName || conversation.userName}
                    </p>
                    <p className="truncate text-xs text-[#5f6368]">{conversation.userEmail}</p>
                    {conversation.unreadCount > 0 ? (
                      <span className="mt-1 inline-flex rounded-full bg-[#ea4335] px-2 py-0.5 text-[11px] font-bold text-white">
                        {conversation.unreadCount} new
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )
          ) : loadingUsers ? (
            <div className="p-4 text-sm text-[#5f6368]">Loading users...</div>
          ) : (
            allUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  setSelectedUserId(user.id);
                  setView("conversations");
                }}
                className={`flex w-full items-start gap-3 border-b border-[#e8ebf5] px-4 py-3 text-left hover:bg-[#f0f4f9] ${
                  selectedUserId === user.id ? "bg-[#eef4ff]" : ""
                }`}
              >
                {user.avatarPath ? (
                  <Image
                    src={`/api/auth/avatar/${encodeURIComponent(user.id)}`}
                    alt={user.name}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a73e8] text-xs font-bold text-white">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#202124]">{user.displayName || user.name}</p>
                  <p className="truncate text-xs text-[#5f6368]">{user.email}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {selectedUserId ? (
            <>
              <div className="border-b border-[#d7e3f7] bg-white px-5 py-4">
                <p className="text-base font-semibold text-[#202124]">{selectedUserLabel}</p>
                <p className="text-sm text-[#5f6368]">{selectedUserEmail}</p>
              </div>

              <div ref={timelineViewportRef} className="flex-1 overflow-y-auto bg-[#fafbff] px-5 py-4">
                {loadingTimeline ? (
                  <div className="text-sm text-[#5f6368]">Loading conversation...</div>
                ) : timeline.length === 0 ? (
                  <div className="rounded-2xl border border-[#e3ebfa] bg-white p-4 text-sm text-[#5f6368]">
                    {mode === "files"
                      ? "No files shared with this user yet."
                      : "No activity yet. Start with a message or share a file."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className={`flex ${item.isMine ? "justify-end" : "justify-start"}`}
                      >
                        {item.kind === "file" ? (
                          <div
                            className={`max-w-sm rounded-2xl px-4 py-3 ${
                              item.isMine ? "bg-[#1a73e8] text-white" : "bg-white text-[#1a73e8]"
                            } border border-[#d7e3f7] shadow-[0_8px_18px_rgba(26,115,232,0.08)]`}
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-80">File transfer</p>
                                          <a
                                            href={`/api/workspaces/${encodeURIComponent(workspaceId)}/direct-message-files/file/${encodeURIComponent(item.id)}/download`}
                                            className="mt-1 block text-sm font-semibold hover:underline"
                            >
                              {item.originalName}
                            </a>
                            <p className="mt-1 text-xs opacity-80">{formatFileSize(item.fileSize)}</p>
                            <p className="mt-1 text-xs opacity-70">{formatTime(item.createdAt)}</p>
                          </div>
                        ) : (
                          <div
                            className={`max-w-sm rounded-2xl px-4 py-3 ${
                              item.isMine ? "bg-[#1a73e8] text-white" : "bg-white text-[#202124]"
                            } border border-[#d7e3f7] shadow-[0_8px_18px_rgba(26,115,232,0.08)]`}
                          >
                            <p className="text-sm leading-6">{item.text}</p>
                            <p className={`mt-1 text-xs ${item.isMine ? "text-white/75" : "text-[#5f6368]"}`}>
                              {formatTime(item.createdAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-[#d7e3f7] bg-white px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {showFileUpload ? (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        disabled={uploadingFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                        className="rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-2 text-sm font-semibold text-[#1a73e8] hover:bg-[#dce9ff] disabled:opacity-60"
                      >
                        {uploadingFile ? "Uploading..." : "Share File"}
                      </button>
                    </>
                  ) : null}

                  {showMessageComposer ? (
                    <>
                      <input
                        type="text"
                        value={messageInput}
                        onChange={(event) => setMessageInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        placeholder="Type a message..."
                        disabled={sendingMessage}
                        className="min-w-[240px] flex-1 rounded-xl border border-[#c8daf8] bg-[#f8fbff] px-4 py-2 text-sm text-[#202124] outline-none focus:border-[#1a73e8] disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={sendingMessage || !messageInput.trim()}
                        className="rounded-xl border border-[#1a73e8] bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1557b0] disabled:opacity-60"
                      >
                        Send
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-[#5f6368]">This page is focused on file transfer only.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-[#fafbff] px-5 py-10 text-center text-sm text-[#5f6368]">
              Select a workspace user to open the conversation.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
