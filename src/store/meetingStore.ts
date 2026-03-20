import { create } from "zustand";

import type { AppUser } from "@/src/types/auth";
import type { ChatMessage, MeetingFileShare, Participant, TranscriptLine } from "@/src/types/meeting";
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
