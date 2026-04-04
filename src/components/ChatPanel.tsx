"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { UserAvatar } from "@/src/components/UserAvatar";
import type { ChatMessage, MeetingFileShare } from "@/src/types/meeting";

type ChatPanelProps = {
  roomId: string;
  currentUserId: string;
  messages: ChatMessage[];
  files: MeetingFileShare[];
  onSendMessage: (
    message: string,
    options?: {
      replyToMessageId?: string;
      replyToSenderName?: string;
      replyToTextPreview?: string;
    },
  ) => void;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onEditMessage?: (messageId: string, message: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onPinMessage?: (messageId: string, currentlyPinned: boolean) => void;
  onTypingChange?: (isTyping: boolean) => void;
  onShareFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
  onMarkMessageSeen?: (messageId: string, sentAt: number) => void;
  currentUserName?: string;
  typingParticipantNames?: string[];
  avatarPathByUserId?: Record<string, string | null | undefined>;
  avatarVersionByUserId?: Record<string, number | null | undefined>;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({
  roomId,
  currentUserId,
  messages,
  files,
  onSendMessage,
  onAddReaction,
  onEditMessage,
  onDeleteMessage,
  onPinMessage,
  onTypingChange,
  onShareFile,
  onMarkMessageSeen,
  currentUserName,
  typingParticipantNames,
  avatarPathByUserId,
  avatarVersionByUserId,
}: ChatPanelProps) {
  const MAX_MESSAGE_LENGTH = 1000;
  const MAX_SHARED_FILE_SIZE_MB = Number(process.env.NEXT_PUBLIC_MAX_SHARED_FILE_SIZE_MB || "100");
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [showDraftRestored, setShowDraftRestored] = useState(false);
  const [mentionActionMessageId, setMentionActionMessageId] = useState<string | null>(null);
  const [draftCaretPos, setDraftCaretPos] = useState(0);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMentionCount, setUnreadMentionCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const draftRestoredTimeoutRef = useRef<number | null>(null);
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const hasLoadedDraftRef = useRef(false);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
  const [, setTimeTick] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const swipeTouchStartXRef = useRef<Map<string, number>>(new Map());
  const [swipeOffsetById, setSwipeOffsetById] = useState<Record<string, number>>({});

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      if (draftRestoredTimeoutRef.current) {
        window.clearTimeout(draftRestoredTimeoutRef.current);
      }
    };
  }, []);

  function scrollToMessage(id: string) {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(id);
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1500);
  }

  // Tick every 30 s so relative timestamps stay current
  useEffect(() => {
    const id = window.setInterval(() => setTimeTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const key = `chat-draft:${roomId}`;
    try {
      const saved = window.localStorage.getItem(key);
      setDraft(saved ?? "");
      if (saved && saved.trim().length > 0) {
        setShowDraftRestored(true);
        if (draftRestoredTimeoutRef.current) {
          window.clearTimeout(draftRestoredTimeoutRef.current);
        }
        draftRestoredTimeoutRef.current = window.setTimeout(() => {
          setShowDraftRestored(false);
        }, 2200);
      } else {
        setShowDraftRestored(false);
      }
    } catch {
      setDraft("");
      setShowDraftRestored(false);
    } finally {
      hasLoadedDraftRef.current = true;
    }
  }, [roomId]);

  useEffect(() => {
    if (!hasLoadedDraftRef.current) {
      return;
    }
    const key = `chat-draft:${roomId}`;
    try {
      if (draft.length === 0) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, draft);
      }
    } catch {
      // Ignore storage failures (private mode, quota, or disabled storage)
    }
  }, [roomId, draft]);

  // Close expanded emoji picker when clicking outside
  useEffect(() => {
    if (!emojiPickerMessageId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (!(e.target instanceof Element)) return;
      if (!e.target.closest("[data-emoji-picker]")) {
        setEmojiPickerMessageId(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [emojiPickerMessageId]);

  // Close mention action card when clicking outside
  useEffect(() => {
    if (!mentionActionMessageId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (!(e.target instanceof Element)) return;
      if (!e.target.closest("[data-mention-action]")) {
        setMentionActionMessageId(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [mentionActionMessageId]);

  // Track whether the user is scrolled near the bottom
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (mentionActionMessageId) {
      setMentionActionMessageId(null);
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setUnreadCount(0);
      setUnreadMentionCount(0);
    }
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnreadCount(0);
    setUnreadMentionCount(0);
    setIsAtBottom(true);
    const last = visibleMessages[visibleMessages.length - 1];
    if (last) onMarkMessageSeen?.(last.id, last.sentAt);
  }

  function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function hasDirectMention(text: string, name: string): boolean {
    const escaped = escapeRegex(name.trim());
    if (!escaped) {
      return false;
    }
    const quotedRegex = new RegExp(`(^|\\s)@"${escaped}"(?=\\s|$|[.,!?;:])`, "i");
    const bareRegex = new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?;:])`, "i");
    return quotedRegex.test(text) || bareRegex.test(text);
  }

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.sentAt - b.sentAt),
    [messages],
  );

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return sortedMessages;
    }
    return sortedMessages.filter(
      (m) =>
        m.senderName.toLowerCase().includes(q) ||
        (!m.isDeleted && m.message.toLowerCase().includes(q)),
    );
  }, [sortedMessages, searchQuery]);

  // Auto-scroll to bottom when new messages arrive (if already at bottom),
  // otherwise rely on the scroll handler to update isAtBottom / unreadCount.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevMessageCountRef.current;
    const next = visibleMessages.length;
    prevMessageCountRef.current = next;
    if (next <= prev) return; // no new messages
    const newCount = next - prev;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      // handleScroll will detect atBottom and clear unreadCount once scroll settles
      const last = visibleMessages[visibleMessages.length - 1];
      if (last) onMarkMessageSeen?.(last.id, last.sentAt);
    } else {
      prevMessageCountRef.current = next;
      // Queue unread increment outside the effect body to satisfy lint rule
      const newMessages = visibleMessages.slice(prev);
      const mentionedByMessages = currentUserName
        ? newMessages.filter(
            (m) =>
              !m.isDeleted &&
              m.senderId !== currentUserId &&
              hasDirectMention(m.message, currentUserName),
          )
        : [];
      const id = window.setTimeout(() => {
        setUnreadCount((c) => c + newCount);
        if (mentionedByMessages.length > 0) {
          setUnreadMentionCount((c) => c + mentionedByMessages.length);
          notifyMention(mentionedByMessages[mentionedByMessages.length - 1].senderName);
        }
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [visibleMessages, currentUserId, currentUserName]);

  // Reset search result index whenever the query or result list changes
  useEffect(() => {
    setSearchResultIndex(0);
  }, [searchQuery, visibleMessages.length]);

  // Ctrl/Cmd+K — focus the search input from anywhere in the panel
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function getRelativeTime(epochMs: number): string {
    const diffSec = Math.floor((Date.now() - epochMs) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  }

  function highlightText(
    text: string,
    query: string,
    onMentionClick?: () => void,
  ): React.ReactNode {
    const q = query.trim();
    const mentionTarget = currentUserName?.trim();
    const patterns: string[] = [];
    const mentionTokens: string[] = [];

    if (q) {
      patterns.push(escapeRegex(q));
    }
    if (mentionTarget) {
      const escapedMention = escapeRegex(mentionTarget);
      mentionTokens.push(`@${mentionTarget}`);
      mentionTokens.push(`@"${mentionTarget}"`);
      patterns.push(`@"${escapedMention}"`);
      patterns.push(`@${escapedMention}`);
    }

    if (patterns.length === 0) {
      return text;
    }

    const regex = new RegExp(`(${patterns.join("|")})`, "gi");
    const mentionTokenSet = new Set(mentionTokens.map((token) => token.toLowerCase()));
    const queryLower = q.toLowerCase();
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (!part) {
        return null;
      }

      const partLower = part.toLowerCase();
      const isMention = mentionTokenSet.has(partLower);
      const isSearchHit = q.length > 0 && partLower === queryLower;

      if (isMention) {
        return (
          <button
            key={i}
            type="button"
            onClick={onMentionClick}
            data-mention-action
            className="rounded border border-[#c8daf8] bg-[#eef4ff] px-0.5 font-semibold text-[#1a73e8] hover:bg-[#e9f2ff]"
            title="Mention options"
          >
            {part}
          </button>
        );
      }

      if (isSearchHit) {
        return (
          <mark key={i} className="rounded bg-[#eef4ff] px-0.5 text-[#1a73e8]">
            {part}
          </mark>
        );
      }

      return part;
    });
  }

  const pinnedMessage = useMemo(
    () =>
      messages
        .filter((m) => m.isPinned && m.pinnedAt)
        .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))[0] ?? null,
    [messages],
  );

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.sharedAt - b.sharedAt),
    [files],
  );

  const replyCountByMessageId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of sortedMessages) {
      if (m.replyToMessageId) {
        const arr = map.get(m.replyToMessageId) ?? [];
        arr.push(m.id);
        map.set(m.replyToMessageId, arr);
      }
    }
    return map;
  }, [sortedMessages]);

  const mentionableNames = useMemo(() => {
    const names = new Set<string>();
    if (currentUserName) {
      names.add(currentUserName);
    }
    messages.forEach((m) => {
      if (m.senderName.trim()) {
        names.add(m.senderName.trim());
      }
    });
    (typingParticipantNames ?? []).forEach((name) => {
      if (name.trim()) {
        names.add(name.trim());
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [messages, typingParticipantNames, currentUserName]);

  const activeMention = useMemo(() => {
    const beforeCaret = draft.slice(0, draftCaretPos);
    const match = beforeCaret.match(/(^|\s)@(?:"([^"]*)|([^\s"]*))$/);
    if (!match) {
      return null;
    }
    const query = (match[2] ?? match[3] ?? "").trimStart();
    const atIndex = beforeCaret.lastIndexOf("@");
    const isQuoted = Boolean(match[2] !== undefined);
    return {
      query,
      atIndex,
      isQuoted,
    };
  }, [draft, draftCaretPos]);

  const mentionSuggestions = useMemo(() => {
    if (!activeMention) {
      return [];
    }
    const query = activeMention.query.toLowerCase();
    return mentionableNames
      .filter((name) => (query.length === 0 ? true : name.toLowerCase().includes(query)))
      .slice(0, 6);
  }, [activeMention, mentionableNames]);

  useEffect(() => {
    setMentionSelectionIndex(0);
  }, [activeMention?.query, mentionSuggestions.length]);

  const submitMessage = () => {
    const text = draft.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    onSendMessage(text, {
      replyToMessageId: replyTarget?.id,
      replyToSenderName: replyTarget?.senderName,
      replyToTextPreview: replyTarget?.message
        ? replyTarget.message.slice(0, 120)
        : undefined,
    });
    onTypingChange?.(false);
    setDraft("");
    setReplyTarget(null);
  };

  const quickReactionEmojis = ["👍", "❤️", "😂", "🔥"];
  const pickerReactionEmojis = ["👏", "🎉", "🙌", "😮", "🤔", "😢", "👀", "✅", "🚀", "💯", "🙏", "😁"];

  const copyMessageText = async (messageId: string, message: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = message;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopiedMessageId(messageId);
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId(null);
      }, 1400);
    } catch {
      setCopiedMessageId(null);
    }
  };

  function applyMention(name: string) {
    if (!activeMention) {
      return;
    }
    const before = draft.slice(0, activeMention.atIndex);
    const after = draft.slice(draftCaretPos);
    const token = /\s/.test(name) ? `@"${name}"` : `@${name}`;
    const spacer = after.startsWith(" ") || after.length === 0 ? "" : " ";
    const nextDraft = `${before}${token}${spacer}${after}`;
    const nextCaretPos = (before + token + spacer).length;
    setDraft(nextDraft);
    setDraftCaretPos(nextCaretPos);
    onTypingChange?.(nextDraft.trim().length > 0);

    window.setTimeout(() => {
      if (!draftInputRef.current) {
        return;
      }
      draftInputRef.current.focus();
      draftInputRef.current.setSelectionRange(nextCaretPos, nextCaretPos);
    }, 0);
  }

  function mentionTokenFor(name: string): string {
    return /\s/.test(name) ? `@"${name}"` : `@${name}`;
  }

  function insertMentionAtEnd(name: string) {
    const mention = mentionTokenFor(name);
    const base = draft.trimEnd();
    const nextDraft = base.length > 0 ? `${base} ${mention} ` : `${mention} `;
    const nextCaretPos = nextDraft.length;
    setDraft(nextDraft);
    setDraftCaretPos(nextCaretPos);
    onTypingChange?.(nextDraft.trim().length > 0);
    window.setTimeout(() => {
      if (!draftInputRef.current) {
        return;
      }
      draftInputRef.current.focus();
      draftInputRef.current.setSelectionRange(nextCaretPos, nextCaretPos);
    }, 0);
  }

  function playMentionPing() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch {
      // AudioContext unavailable — silently skip
    }
  }

  function notifyMention(senderName: string) {
    playMentionPing();
    if (
      notificationsEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      document.visibilityState === "hidden"
    ) {
      new Notification(`${senderName} mentioned you`, {
        body: "Click to return to the meeting chat.",
        tag: "chat-mention",
      });
    }
  }

  async function toggleNotifications() {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
      return;
    }
    const result = await Notification.requestPermission();
    if (result === "granted") setNotificationsEnabled(true);
  }

  function handleSwipeStart(msgId: string, e: React.TouchEvent) {
    swipeTouchStartXRef.current.set(msgId, e.touches[0].clientX);
  }

  function handleSwipeMove(msgId: string, e: React.TouchEvent) {
    const startX = swipeTouchStartXRef.current.get(msgId);
    if (startX === undefined) return;
    const delta = e.touches[0].clientX - startX;
    if (delta < 0) return; // only right swipe
    const capped = Math.min(delta, 72);
    setSwipeOffsetById((prev) => ({ ...prev, [msgId]: capped }));
  }

  function handleSwipeEnd(msg: ChatMessage) {
    const offset = swipeOffsetById[msg.id] ?? 0;
    swipeTouchStartXRef.current.delete(msg.id);
    setSwipeOffsetById((prev) => { const next = { ...prev }; delete next[msg.id]; return next; });
    if (offset >= 48 && !msg.isDeleted) {
      setReplyTarget(msg);
    }
  }

  function stepSearchResult(direction: 1 | -1) {
    if (visibleMessages.length === 0) return;
    const next = (searchResultIndex + direction + visibleMessages.length) % visibleMessages.length;
    setSearchResultIndex(next);
    scrollToMessage(visibleMessages[next].id);
  }

  function exportTranscript() {
    const lines = visibleMessages.map((msg) => {
      const date = new Date(msg.sentAt).toLocaleString();
      if (msg.isDeleted) return `[${date}] ${msg.senderName}: [message deleted]`;
      const edited = msg.editedAt ? " (edited)" : "";
      const reply = msg.replyToTextPreview ? `  > ${msg.replyToSenderName}: ${msg.replyToTextPreview}\n` : "";
      return `${reply}[${date}] ${msg.senderName}${edited}: ${msg.message}`;
    });
    const header = `Meeting Chat Transcript — ${new Date().toLocaleString()}\n${"=".repeat(60)}\n\n`;
    const blob = new Blob([header + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-transcript-${roomId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-[#d7e4f8] bg-white shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
      <header className="flex items-center justify-between border-b border-[#d7e4f8] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#202124]">Meeting Chat</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleNotifications}
            title={notificationsEnabled ? "Mute mention alerts" : "Enable mention alerts"}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              notificationsEnabled
                ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8] hover:bg-[#dceeff]"
                : "border-[#d7e4f8] bg-white text-[#5f6368] hover:border-[#bfd6fb] hover:text-[#1a73e8]"
            }`}
          >
            {notificationsEnabled ? "🔔" : "🔕"}
          </button>
          <button
            type="button"
            onClick={exportTranscript}
            disabled={visibleMessages.length === 0}
            title="Export transcript as .txt"
            className="rounded-md border border-[#d7e4f8] bg-white px-2 py-1 text-xs text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </header>

      <div className="border-b border-[#d7e4f8] px-3 py-2">
        <div className="relative">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            ref={searchInputRef}
            className="w-full rounded-lg border border-[#d7e4f8] bg-[#f7fbff] py-1.5 pl-3 pr-8 text-xs text-[#202124] placeholder:text-[#8a9099] outline-none focus:border-[#1a73e8]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5f6368] hover:text-[#1a73e8] text-sm leading-none"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery.trim() && (
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-[11px] text-[#5f6368]">
              {visibleMessages.length === 0
                ? "No results"
                : `${searchResultIndex + 1} of ${visibleMessages.length} result${visibleMessages.length !== 1 ? "s" : ""}`}
            </p>
            {visibleMessages.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepSearchResult(-1)}
                  className="rounded border border-[#d7e4f8] px-1.5 py-0.5 text-[11px] text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  aria-label="Previous result"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => stepSearchResult(1)}
                  className="rounded border border-[#d7e4f8] px-1.5 py-0.5 text-[11px] text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  aria-label="Next result"
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {pinnedMessage && (
        <div className="flex items-start gap-2 border-b border-[#d7e4f8] bg-[#f7fbff] px-3 py-2 text-xs">
          <span className="mt-0.5 text-[#1a73e8]" aria-hidden="true">📌</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#1a73e8]">Pinned message</p>
            <p className="truncate text-[#5f6368]">
              {pinnedMessage.isDeleted ? "[deleted]" : pinnedMessage.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onPinMessage?.(pinnedMessage.id, true)}
            className="shrink-0 rounded border border-[#c8daf8] px-1.5 py-0.5 text-[#1a73e8] hover:border-[#1a73e8] hover:bg-[#eef4ff]"
            title="Unpin message"
          >
            Unpin
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
      >
        {sortedFiles.length > 0 && (
          <section className="space-y-2 rounded-lg border border-[#d7e4f8] bg-[#eef4ff] p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1a73e8]">Shared Files</p>
            {sortedFiles.map((file) => (
              <article key={file.id} className="rounded-md border border-[#c8daf8] bg-white p-2">
                <a
                  href={`/api/meetings/${encodeURIComponent(roomId)}/files/${encodeURIComponent(file.id)}`}
                  className="text-sm font-semibold text-[#1a73e8] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {file.fileName}
                </a>
                <p className="mt-1 text-xs text-[#5f6368]">
                  Shared by {file.senderName} • {formatFileSize(file.fileSize)} • {new Date(file.sharedAt).toLocaleTimeString()}
                </p>
              </article>
            ))}
          </section>
        )}

        {sortedMessages.length === 0 && (
          <p className="rounded-lg border border-[#d7e4f8] bg-[#f7fbff] p-2 text-[#5f6368]">No messages yet.</p>
        )}
        {visibleMessages.length === 0 && sortedMessages.length > 0 && (
          <p className="rounded-lg border border-[#d7e4f8] bg-[#f7fbff] p-2 text-[#5f6368]">No messages match your search.</p>
        )}
        {visibleMessages.map((msg) => {
          const mentionName = currentUserName?.trim();
          const mentionedYou = mentionName
            ? msg.senderId !== currentUserId &&
              !msg.isDeleted &&
              hasDirectMention(msg.message, mentionName)
            : false;

          return (
          <article
            key={msg.id}
            ref={(el) => {
              if (el) messageRefs.current.set(msg.id, el);
              else messageRefs.current.delete(msg.id);
            }}
            onTouchStart={(e) => handleSwipeStart(msg.id, e)}
            onTouchMove={(e) => handleSwipeMove(msg.id, e)}
            onTouchEnd={() => handleSwipeEnd(msg)}
            style={{ transform: swipeOffsetById[msg.id] ? `translateX(${swipeOffsetById[msg.id]}px)` : undefined }}
            className={`relative rounded-lg border border-[#d7e4f8] p-2 text-[#202124] transition-[transform,box-shadow] duration-150 ${
              highlightedMessageId === msg.id
                ? "bg-[#eef4ff] ring-2 ring-[#1a73e8]/30"
                : "bg-white"
            }`}
          >
            {swipeOffsetById[msg.id] !== undefined && swipeOffsetById[msg.id] > 8 && (
              <span
                className="pointer-events-none absolute -left-6 top-1/2 -translate-y-1/2 text-base text-[#1a73e8]/60"
                aria-hidden="true"
              >
                ↩
              </span>
            )}
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[#5f6368]">
              <div className="flex min-w-0 items-center gap-2">
                <UserAvatar
                  name={msg.senderName}
                  userId={msg.senderId}
                  avatarPath={avatarPathByUserId?.[msg.senderId]}
                  avatarVersion={avatarVersionByUserId?.[msg.senderId]}
                  size="sm"
                />
                <span className="truncate">{msg.senderName}</span>
                {mentionedYou && (
                  <span className="rounded-full border border-[#c8daf8] bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1a73e8]">
                    Mentioned you
                  </span>
                )}
              </div>
              <span
                title={new Date(msg.sentAt).toLocaleString()}
                className="cursor-default"
              >
                {getRelativeTime(msg.sentAt)}
              </span>
            </div>
            {msg.replyToMessageId && (msg.replyToSenderName || msg.replyToTextPreview) && (
              <button
                type="button"
                onClick={() => msg.replyToMessageId && scrollToMessage(msg.replyToMessageId)}
                className="mb-1 w-full rounded border-l-2 border-[#1a73e8] bg-[#f7fbff] px-2 py-1 text-left text-xs text-[#5f6368] hover:bg-[#eef4ff]"
                title="Jump to original message"
              >
                <p className="font-semibold text-[#1a73e8]">Replying to {msg.replyToSenderName || "message"}</p>
                {msg.replyToTextPreview && (
                  <p className="truncate text-[#5f6368]">{msg.replyToTextPreview}</p>
                )}
              </button>
            )}
            {(() => {
              const replyIds = replyCountByMessageId.get(msg.id);
              if (!replyIds || replyIds.length === 0) return null;
              const lastReplyId = replyIds[replyIds.length - 1];
              return (
                <button
                  type="button"
                  onClick={() => scrollToMessage(lastReplyId)}
                  title="Jump to latest reply"
                  className="mt-1 flex items-center gap-1 text-[11px] text-[#1a73e8]/70 hover:text-[#1a73e8]"
                >
                  <span className="inline-block h-px w-4 bg-[#1a73e8]/30" />
                  {replyIds.length} {replyIds.length === 1 ? "reply" : "replies"} ↓
                </button>
              );
            })()}
            {editingMessageId === msg.id ? (
              <div className="space-y-2">
                <textarea
                  value={editingDraft}
                  onChange={(event) => setEditingDraft(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#d7e4f8] bg-white px-3 py-2 text-sm text-[#202124] outline-none placeholder:text-[#8a9099]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = editingDraft.trim();
                      if (!next) {
                        return;
                      }
                      onEditMessage?.(msg.id, next);
                      setEditingMessageId(null);
                      setEditingDraft("");
                    }}
                    className="rounded-lg bg-[#1a73e8] px-2 py-1 text-xs font-semibold text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessageId(null);
                      setEditingDraft("");
                    }}
                    className="rounded-lg border border-[#d7e4f8] px-2 py-1 text-xs text-[#5f6368]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className={`break-words ${msg.isDeleted ? "italic text-[#8a9099]" : ""}`}>
                  {msg.isDeleted
                    ? msg.message
                    : highlightText(msg.message, searchQuery, () => {
                        setMentionActionMessageId((current) =>
                          current === msg.id ? null : msg.id,
                        );
                      })}
                </p>
                {msg.editedAt && !msg.isDeleted && (
                  <p className="mt-1 text-[11px] text-[#5f6368]">Edited</p>
                )}
                {mentionActionMessageId === msg.id && (
                  <div
                    data-mention-action
                    className="mt-2 flex flex-wrap items-center gap-1 rounded-md border border-[#c8daf8] bg-[#eef4ff] p-2 text-xs"
                  >
                    <span className="text-[#1a73e8]">Mention action:</span>
                    <button
                      type="button"
                      onClick={() => {
                        insertMentionAtEnd(msg.senderName);
                        setMentionActionMessageId(null);
                      }}
                      className="rounded border border-[#c8daf8] px-2 py-0.5 text-[#1a73e8] hover:bg-[#eef4ff]"
                    >
                      Mention sender
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(msg.senderName);
                        } catch {
                          // Ignore clipboard failures
                        }
                      }}
                      className="rounded border border-[#c8daf8] px-2 py-0.5 text-[#1a73e8] hover:bg-[#eef4ff]"
                    >
                      Copy name
                    </button>
                    <button
                      type="button"
                      onClick={() => setMentionActionMessageId(null)}
                      className="rounded border border-[#d7e4f8] px-2 py-0.5 text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                    >
                      Close
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1">
              {!msg.isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTarget(msg);
                    scrollToMessage(msg.id);
                  }}
                  className="rounded-full border border-[#d7e4f8] bg-white px-2 py-0.5 text-xs text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  title="Reply"
                >
                  Reply
                </button>
              )}
              {!msg.isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    void copyMessageText(msg.id, msg.message);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    copiedMessageId === msg.id
                      ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8]"
                      : "border-[#d7e4f8] bg-white text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  }`}
                  title="Copy message"
                >
                  {copiedMessageId === msg.id ? "Copied" : "Copy"}
                </button>
              )}
              {!msg.isDeleted && (
                <button
                  type="button"
                  onClick={() => onPinMessage?.(msg.id, !!msg.isPinned)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    msg.isPinned
                      ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8] hover:border-[#0d62d0]"
                      : "border-[#d7e4f8] bg-white text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  }`}
                  title={msg.isPinned ? "Unpin message" : "Pin message"}
                >
                  {msg.isPinned ? "📌 Pinned" : "Pin"}
                </button>
              )}
              {!msg.isDeleted && msg.senderId === currentUserId && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessageId(msg.id);
                      setEditingDraft(msg.message === "[deleted]" ? "" : msg.message);
                    }}
                    className="rounded-full border border-[#d7e4f8] bg-white px-2 py-0.5 text-xs text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessageId(null);
                      setEditingDraft("");
                      onDeleteMessage?.(msg.id);
                    }}
                    className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200 hover:border-rose-400/60 hover:text-rose-100"
                  >
                    Delete
                  </button>
                </>
              )}
              {!msg.isDeleted && quickReactionEmojis.map((emoji) => {
                const count = (msg.reactions ?? []).filter((reaction) => reaction.emoji === emoji).length;

                return (
                  <button
                    key={`${msg.id}-${emoji}`}
                    type="button"
                    onClick={() => onAddReaction?.(msg.id, emoji)}
                    className="rounded-full border border-[#d7e4f8] bg-white px-2 py-0.5 text-xs text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                    title={`React ${emoji}`}
                  >
                    {emoji}{count > 0 ? ` ${count}` : ""}
                  </button>
                );
              })}
              {!msg.isDeleted && (
                <button
                  data-emoji-picker
                  type="button"
                  onClick={() =>
                    setEmojiPickerMessageId((current) =>
                      current === msg.id ? null : msg.id,
                    )
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    emojiPickerMessageId === msg.id
                      ? "border-[#1a73e8] bg-[#e9f2ff] text-[#1a73e8]"
                      : "border-[#d7e4f8] bg-white text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                  }`}
                  title="More reactions"
                >
                  + React
                </button>
              )}
            </div>

            {!msg.isDeleted && (msg.reactions ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {Object.entries(
                  (msg.reactions ?? []).reduce<Record<string, { count: number; names: string[]; youReacted: boolean }>>((acc, reaction) => {
                    if (!acc[reaction.emoji]) acc[reaction.emoji] = { count: 0, names: [], youReacted: false };
                    acc[reaction.emoji].count += 1;
                    const displayName = reaction.senderId === currentUserId ? "You" : reaction.senderName;
                    acc[reaction.emoji].names.push(displayName);
                    if (reaction.senderId === currentUserId) acc[reaction.emoji].youReacted = true;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
                  .map(([emoji, { count, names, youReacted }]) => (
                    <button
                      key={`${msg.id}-summary-${emoji}`}
                      type="button"
                      onClick={() => onAddReaction?.(msg.id, emoji)}
                      className={`rounded-full border px-2 py-0.5 text-xs text-[#1a73e8] hover:border-[#1a73e8] hover:bg-[#eef4ff] ${youReacted ? "border-[#1a73e8] bg-[#e9f2ff] font-medium" : "border-[#c8daf8] bg-[#f7fbff]"}`}
                      title={names.join(", ")}
                    >
                      {emoji} {count}
                    </button>
                  ))}
              </div>
            )}

            {!msg.isDeleted && emojiPickerMessageId === msg.id && (
              <div data-emoji-picker className="mt-2 grid grid-cols-6 gap-1 rounded-lg border border-[#d7e4f8] bg-white p-2 shadow-md">
                {pickerReactionEmojis.map((emoji) => (
                  <button
                    key={`${msg.id}-picker-${emoji}`}
                    type="button"
                    onClick={() => {
                      onAddReaction?.(msg.id, emoji);
                      setEmojiPickerMessageId(null);
                    }}
                    className="rounded-md border border-[#d7e4f8] bg-[#f7fbff] px-2 py-1 text-sm text-[#202124] hover:border-[#1a73e8] hover:text-[#1a73e8]"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {msg.senderId === currentUserId && !msg.isDeleted && (() => {
              const seenByOthers = (msg.seenBy ?? []).filter((s) => s.userId !== currentUserId);
              if (seenByOthers.length === 0) return null;
              return (
                <div className="mt-1 flex items-center justify-end gap-0.5">
                  {seenByOthers.slice(0, 3).map((s) => (
                    <span
                      key={s.userId}
                      title={`Seen by ${s.name}`}
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e9f2ff] text-[8px] font-semibold text-[#1a73e8] select-none"
                    >
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                  {seenByOthers.length > 3 && (
                    <span className="text-[9px] text-[#5f6368]">+{seenByOthers.length - 3}</span>
                  )}
                </div>
              );
            })()}
          </article>
          );
        })}

        {typingParticipantNames && typingParticipantNames.length > 0 && (
          <p className="rounded-lg bg-[#eef4ff] px-2 py-1 text-xs text-[#1a73e8]">
            {typingParticipantNames.length === 1
              ? `${typingParticipantNames[0]} is typing...`
              : `${typingParticipantNames.slice(0, 2).join(", ")}${typingParticipantNames.length > 2 ? " and others" : ""} are typing...`}
          </p>
        )}

        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 mx-auto flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#1a73e8] bg-white px-3 py-1 text-xs font-semibold text-[#1a73e8] shadow-lg hover:bg-[#eef4ff]"
          >
            {unreadMentionCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1a73e8] px-0.5 text-[10px] font-bold text-white">
                @{unreadMentionCount > 9 ? "9+" : unreadMentionCount}
              </span>
            )}
            {unreadCount > 0 ? (
              <>
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1a73e8] text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
                New messages
              </>
            ) : (
              "↓ Jump to latest"
            )}
          </button>
        )}
      </div>

      <form
        className="flex flex-wrap gap-2 border-t border-[#d7e4f8] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitMessage();
        }}
      >
        {showDraftRestored && (
          <p className="w-full rounded-md border border-[#c8daf8] bg-[#eef4ff] px-2 py-1 text-xs text-[#1a73e8]">
            Draft restored
          </p>
        )}
        {replyTarget && (
          <div className="mb-2 w-full rounded border-l-2 border-[#1a73e8] bg-[#f7fbff] px-2 py-1 text-xs text-[#5f6368]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                Replying to <span className="font-semibold text-[#1a73e8]">{replyTarget.senderName}</span>: {replyTarget.message}
              </span>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="rounded border border-[#d7e4f8] px-1.5 py-0.5 text-[11px] text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="relative flex-1">
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 z-20 mb-1 w-full max-w-xs rounded-lg border border-[#d7e4f8] bg-white p-1 shadow-xl">
              {mentionSuggestions.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyMention(name)}
                  className={`flex w-full items-center rounded-md px-2 py-1 text-left text-xs ${
                    index === mentionSelectionIndex
                      ? "bg-[#eef4ff] text-[#1a73e8]"
                      : "text-[#202124] hover:bg-[#f7fbff]"
                  }`}
                >
                  {/\s/.test(name) ? `@"${name}"` : `@${name}`}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={draftInputRef}
            value={draft}
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDraft(nextValue);
              setDraftCaretPos(event.target.selectionStart ?? nextValue.length);
              onTypingChange?.(nextValue.trim().length > 0);
            }}
            onClick={(event) => {
              setDraftCaretPos(event.currentTarget.selectionStart ?? draft.length);
            }}
            onKeyUp={(event) => {
              setDraftCaretPos(event.currentTarget.selectionStart ?? draft.length);
            }}
            onKeyDown={(event) => {
              if (mentionSuggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMentionSelectionIndex((idx) => (idx + 1) % mentionSuggestions.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMentionSelectionIndex((idx) =>
                    idx === 0 ? mentionSuggestions.length - 1 : idx - 1,
                  );
                  return;
                }
                if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                  event.preventDefault();
                  applyMention(mentionSuggestions[mentionSelectionIndex] ?? mentionSuggestions[0]);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftCaretPos(draft.length);
                  return;
                }
              }

              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                submitMessage();
                return;
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitMessage();
                return;
              }

              if (event.key === "Escape") {
                setReplyTarget(null);
                setEditingMessageId(null);
                setEditingDraft("");
                draftInputRef.current?.blur();
              }
            }}
            placeholder="Type a message…"
            className="min-h-[56px] w-full resize-none rounded-lg border border-[#d7e4f8] bg-white px-3 py-2 text-sm text-[#202124] outline-none placeholder:text-[#8a9099] focus:border-[#1a73e8]"
          />
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
          <p className="text-[11px] text-[#5f6368]">
            {draft.length}/{MAX_MESSAGE_LENGTH}
          </p>
          <p className="text-[10px] text-[#8a9099] hidden sm:block">
            Enter · Ctrl+Enter to send · Esc to cancel · Ctrl+K to search
          </p>
          <button
            type="submit"
            className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#d7e4f8] disabled:text-[#5f6368]"
            disabled={draft.trim().length === 0}
          >
            Send
          </button>
        </div>
      </form>

      <div className="border-t border-[#d7e4f8] p-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#d7e4f8] bg-[#eef4ff] px-3 py-2 text-xs font-semibold text-[#1a73e8]">
          <span>{isUploading ? "Uploading..." : "Share File"}</span>
          <input
            type="file"
            accept="*/*"
            className="hidden"
            disabled={isUploading}
            onChange={async (event) => {
              const inputEl = event.currentTarget;
              const selected = event.target.files?.[0];
              if (!selected) {
                return;
              }

              setIsUploading(true);
              setUploadStatus("");
              const result = await onShareFile(selected);
              if (result.ok) {
                setUploadStatus(`${selected.name} shared.`);
              } else {
                setUploadStatus(result.error ? `Failed to share ${selected.name}: ${result.error}` : `Failed to share ${selected.name}.`);
              }
              setIsUploading(false);
              inputEl.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-[11px] text-[#5f6368]">Max file size: {MAX_SHARED_FILE_SIZE_MB}MB</p>
        {uploadStatus && <p className="mt-1 text-xs text-[#1a73e8]">{uploadStatus}</p>}
      </div>
    </aside>
  );
}
