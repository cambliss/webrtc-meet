import { create } from "zustand";

import type { AppUser } from "@/src/types/auth";
import type { ChatMessage, ChatMessageReaction, MeetingFileShare, Participant, TranscriptLine } from "@/src/types/meeting";
import type { WaitingRoomParticipant } from "@/src/types/socket";

type MeetingState = {
  roomId: string;
  me: AppUser | null;
  role: Participant["role"] | null;
  participants: Participant[];
  chatMessages: ChatMessage[];
  fileShares: MeetingFileShare[];
  transcriptLines: TranscriptLine[];
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  waitingRoom: WaitingRoomParticipant[];
  isInWaitingRoom: boolean;
  setRoomContext: (roomId: string, me: AppUser) => void;
  upsertParticipant: (participant: Participant) => void;
  removeParticipant: (socketId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  addChatMessageReaction: (messageId: string, reaction: ChatMessageReaction) => void;
  removeChatMessageReaction: (messageId: string, senderId: string, emoji: string) => void;
  editChatMessage: (messageId: string, message: string, editedAt: number) => void;
  deleteChatMessage: (messageId: string, deletedAt: number) => void;
  pinChatMessage: (messageId: string, pinnedAt: number) => void;
  unpinChatMessage: (messageId: string) => void;
  markChatMessageSeen: (messageId: string, sentAt: number, userId: string, name: string) => void;
  addFileShare: (file: MeetingFileShare) => void;
  setFileShares: (files: MeetingFileShare[]) => void;
  setTranscriptLines: (lines: TranscriptLine[]) => void;
  addTranscriptLine: (line: TranscriptLine) => void;
  setMicEnabled: (value: boolean) => void;
  setCameraEnabled: (value: boolean) => void;
  setScreenSharing: (value: boolean) => void;
  setRecording: (value: boolean) => void;
  setWaitingRoom: (waiting: WaitingRoomParticipant[]) => void;
  setIsInWaitingRoom: (value: boolean) => void;
  raisedHands: string[];
  setRaisedHands: (socketIds: string[]) => void;
  resetMeetingState: () => void;
};

const initialState = {
  roomId: "",
  me: null,
  role: null,
  participants: [],
  chatMessages: [],
  fileShares: [],
  transcriptLines: [],
  isMicEnabled: true,
  isCameraEnabled: true,
  isScreenSharing: false,
  isRecording: false,
  waitingRoom: [] as WaitingRoomParticipant[],
  isInWaitingRoom: false,
  raisedHands: [] as string[],
};

export const useMeetingStore = create<MeetingState>((set) => ({
  ...initialState,
  setRoomContext: (roomId, me) => set({ roomId, me, role: me.role }),
  upsertParticipant: (participant) =>
    set((state) => {
      const existingIndex = state.participants.findIndex(
        (p) => p.socketId === participant.socketId,
      );

      if (existingIndex === -1) {
        return { participants: [...state.participants, participant] };
      }

      const updated = [...state.participants];
      updated[existingIndex] = participant;
      return { participants: updated };
    }),
  removeParticipant: (socketId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.socketId !== socketId),
    })),
  setParticipants: (participants) => set({ participants }),
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  addChatMessageReaction: (messageId, reaction) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const currentReactions = message.reactions ?? [];
        const alreadyExists = currentReactions.some(
          (item) => item.senderId === reaction.senderId && item.emoji === reaction.emoji,
        );

        if (alreadyExists) {
          return message;
        }

        return {
          ...message,
          reactions: [...currentReactions, reaction],
        };
      }),
    })),
  removeChatMessageReaction: (messageId, senderId, emoji) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const currentReactions = message.reactions ?? [];
        return {
          ...message,
          reactions: currentReactions.filter(
            (item) => !(item.senderId === senderId && item.emoji === emoji),
          ),
        };
      }),
    })),
  editChatMessage: (messageId, message, editedAt) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((item) =>
        item.id === messageId
          ? {
              ...item,
              message,
              editedAt,
              isDeleted: false,
              deletedAt: null,
            }
          : item,
      ),
    })),
  deleteChatMessage: (messageId, deletedAt) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((item) =>
        item.id === messageId
          ? {
              ...item,
              message: "[deleted]",
              isDeleted: true,
              deletedAt,
              reactions: [],
            }
          : item,
      ),
    })),
  pinChatMessage: (messageId, pinnedAt) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((item) =>
        item.id === messageId ? { ...item, isPinned: true, pinnedAt } : item,
      ),
    })),
  unpinChatMessage: (messageId) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((item) =>
        item.id === messageId ? { ...item, isPinned: false, pinnedAt: null } : item,
      ),
    })),
  markChatMessageSeen: (messageId, sentAt, userId, name) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((item) => {
        if (item.sentAt > sentAt || item.isDeleted) return item;
        if ((item.seenBy ?? []).some((s) => s.userId === userId)) return item;
        return { ...item, seenBy: [...(item.seenBy ?? []), { userId, name }] };
      }),
    })),
  addFileShare: (file) =>
    set((state) => {
      if (state.fileShares.some((item) => item.id === file.id)) {
        return state;
      }

      return { fileShares: [...state.fileShares, file] };
    }),
  setFileShares: (files) => set({ fileShares: files }),
  setTranscriptLines: (lines) => set({ transcriptLines: lines }),
  addTranscriptLine: (line) =>
    set((state) => ({ transcriptLines: [...state.transcriptLines, line] })),
  setMicEnabled: (value) => set({ isMicEnabled: value }),
  setCameraEnabled: (value) => set({ isCameraEnabled: value }),
  setScreenSharing: (value) => set({ isScreenSharing: value }),
  setRecording: (value) => set({ isRecording: value }),
  setWaitingRoom: (waiting) => set({ waitingRoom: waiting }),
  setIsInWaitingRoom: (value) => set({ isInWaitingRoom: value }),
  setRaisedHands: (socketIds) => set({ raisedHands: socketIds }),
  resetMeetingState: () => set({ ...initialState }),
}));
