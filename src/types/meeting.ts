import type { UserRole } from "@/src/types/auth";

export type Participant = {
  socketId: string;
  userId: string;
  username: string;
  role: UserRole;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  avatarPath?: string | null;
  avatarVersion?: number | null;
  invitedByUserId?: string | null;
  invitedByName?: string | null;
  deviceFingerprint?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
  joinSessionId?: string | null;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  sentAt: number;
  replyToMessageId?: string | null;
  replyToSenderName?: string | null;
  replyToTextPreview?: string | null;
  editedAt?: number | null;
  isDeleted?: boolean;
  deletedAt?: number | null;
  isPinned?: boolean;
  pinnedAt?: number | null;
  reactions?: ChatMessageReaction[];
  seenBy?: { userId: string; name: string }[];
};

export type ChatMessageReaction = {
  emoji: string;
  senderId: string;
  senderName: string;
  createdAt: number;
};

export type MeetingFileShare = {
  id: string;
  senderId: string;
  senderName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sharedAt: number;
};

export type TranscriptLine = {
  id: string;
  roomId: string;
  socketId: string;
  speakerName: string;
  text: string;
  isFinal: boolean;
  createdAt: number;
};

export type RemoteStream = {
  participant: Participant;
  stream: MediaStream;
};
