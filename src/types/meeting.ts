import type { UserRole } from "@/src/types/auth";

export type Participant = {
  socketId: string;
  userId: string;
  username: string;
  role: UserRole;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
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
