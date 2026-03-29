import type { UserRole } from "@/src/types/auth";
import type { ChatMessage, MeetingFileShare, TranscriptLine } from "@/src/types/meeting";

export type JoinRoomPayload = {
  roomId: string;
  userId: string;
  username: string;
  role: UserRole;
  inviteToken?: string;
  parentInviteToken?: string;
  deviceFingerprint?: string;
  clientSessionId?: string;
  userAgent?: string;
};

export type JoinRoomResponsePayload = {
  /** "admitted" = entered room immediately; "waiting" = placed in waiting room */
  status: JoinRoomStatus;
  // The fields below are only populated when status === "admitted".
  roomUsers: Array<{
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
  }>;
  routerRtpCapabilities: unknown;
  existingProducers: Array<{ producerId: string; socketId?: string; kind: "audio" | "video" }>;
  transcriptHistory: TranscriptLine[];
  fileShareHistory: MeetingFileShare[];
  e2ee?: E2eeRoomStatePayload;
};

export type CreateWebRtcTransportPayload = {
  roomId: string;
  direction: "send" | "recv";
};

export type ConnectWebRtcTransportPayload = {
  roomId: string;
  transportId: string;
  dtlsParameters: unknown;
};

export type ProducePayload = {
  roomId: string;
  transportId: string;
  kind: "audio" | "video";
  rtpParameters: unknown;
  appData?: Record<string, unknown>;
};

export type ConsumePayload = {
  roomId: string;
  transportId: string;
  producerId: string;
  rtpCapabilities: unknown;
};

export type ResumeConsumerPayload = {
  roomId: string;
  consumerId: string;
};

export type StartRecordingPayload = {
  roomId: string;
  targetSocketId?: string;
};

export type StopRecordingPayload = {
  roomId: string;
};

export type StartTranscriptionPayload = {
  roomId: string;
};

export type StopTranscriptionPayload = {
  roomId: string;
};

export type LegacyParticipantSignal = {
  roomId: string;
  targetSocketId: string;
  senderSocketId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export type WebRtcTransportParams = {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
};

export type PresenceUpdatePayload = {
  roomId: string;
  userId: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isScreenSharing?: boolean;
};

export type ChatPayload = {
  roomId: string;
  message: ChatMessage;
};

export type ChatTypingPayload = {
  roomId: string;
  socketId: string;
  senderName: string;
  isTyping: boolean;
};

export type ChatMessageReactionPayload = {
  roomId: string;
  messageId: string;
  action: "add" | "remove";
  reaction: {
    emoji: string;
    senderId: string;
    senderName: string;
    createdAt: number;
  };
};

export type ChatMessageEditPayload = {
  roomId: string;
  messageId: string;
  senderId: string;
  message: string;
  editedAt: number;
};

export type ChatMessageDeletePayload = {
  roomId: string;
  messageId: string;
  senderId: string;
  deletedAt: number;
};

export type ChatMessagePinPayload = {
  roomId: string;
  messageId: string;
  /** Unix timestamp when pinned; null means unpin */
  pinnedAt: number | null;
};

export type ChatMessageSeenPayload = {
  roomId: string;
  messageId: string;
  /** sentAt of the seen message — used to mark all earlier messages seen too */
  sentAt: number;
  userId: string;
  name: string;
};

export type FileSharedPayload = {
  roomId: string;
  file: MeetingFileShare;
};

// ── Waiting room ────────────────────────────────────────────────────────────

export type WaitingRoomParticipant = {
  socketId: string;
  userId: string;
  username: string;
  avatarPath?: string | null;
  avatarVersion?: number | null;
  requestedAt: number;
};

/** Emitted by server → host(s) whenever the waiting room list changes. */
export type WaitingRoomUpdatePayload = {
  roomId: string;
  waiting: WaitingRoomParticipant[];
};

/** Emitted by host → server to admit a waiting participant. */
export type AdmitParticipantPayload = {
  roomId: string;
  socketId: string;
};

/** Emitted by host → server to reject a waiting participant. */
export type RejectParticipantPayload = {
  roomId: string;
  socketId: string;
};

/** Emitted by server → waiting participant with the admission decision. */
export type AdmissionDecisionPayload = {
  admitted: boolean;
};

export type SecurityAlertPayload = {
  id: string;
  roomId: string;
  meetingId: string;
  participantName: string;
  invitedByName: string | null;
  invitedByUserId: string | null;
  deviceType: string | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  reason: string;
  createdAt: number;
  targetSocketId?: string | null;
};

export type HostSecurityActionPayload = {
  roomId: string;
  action: "allow" | "remove" | "block_device" | "block_ip" | "lock" | "unlock";
  targetSocketId?: string;
  targetDeviceFingerprint?: string;
  targetIpAddress?: string;
  reason?: string;
};

// Join response is extended with a status so participants know whether they
// entered the room immediately or were placed in the waiting room.
export type JoinRoomStatus = "admitted" | "waiting";

// ── Raise hand ──────────────────────────────────────────────────────────────

/** Emitted by participant → server to raise their own hand. */
export type RaiseHandPayload = {
  roomId: string;
};

/** Emitted by host or self → server to lower a hand. */
export type LowerHandPayload = {
  roomId: string;
  /** socketId of the participant whose hand should be lowered. */
  socketId: string;
};

/** Emitted by server → all room members whenever the raised-hands list changes. */
export type HandRaisedUpdatePayload = {
  roomId: string;
  /** socketIds of all participants with a raised hand. */
  raisedHands: string[];
};

// ── Reactions ───────────────────────────────────────────────────────────────

export type ReactionEmoji = "👍" | "❤️" | "👏" | "😂";

/** Emitted by participant -> server to send a reaction to the room. */
export type SendReactionPayload = {
  roomId: string;
  emoji: ReactionEmoji;
};

/** Emitted by server -> room whenever a reaction is sent. */
export type ReactionEventPayload = {
  roomId: string;
  emoji: ReactionEmoji;
  senderSocketId: string;
  senderName: string;
  createdAt: number;
};

// ── Breakout rooms ──────────────────────────────────────────────────────────

export type BreakoutRoom = {
  id: string;
  name: string;
  participantSocketIds: string[];
};

/** Host -> server: create N breakout rooms. */
export type CreateBreakoutRoomsPayload = {
  roomId: string;
  count: number;
};

/** Host -> server: assign participants to rooms (socketId -> breakoutRoomId). */
export type AssignBreakoutPayload = {
  roomId: string;
  assignments: Record<string, string>;
};

/** Host -> server: end all breakout sessions and return everyone to main room. */
export type CloseBreakoutRoomsPayload = {
  roomId: string;
};

/** Server -> all room members: current breakout room state. */
export type BreakoutUpdatePayload = {
  roomId: string;
  breakoutRooms: BreakoutRoom[];
};

/** Server -> individual participant: they have been assigned to a breakout. */
export type BreakoutAssignedPayload = {
  roomId: string;
  breakoutRoomId: string;
  breakoutRoomName: string;
};

/** Server -> all participants: leave breakout and return to main room. */
export type BreakoutClosedPayload = {
  mainRoomId: string;
};

// ── Whiteboard ──────────────────────────────────────────────────────────────

export type WhiteboardPoint = { x: number; y: number };

export type WhiteboardShapeKind = "line" | "rectangle" | "ellipse" | "arrow";

export type WhiteboardElementBase = {
  id: string;
  socketId: string;
  participantName: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  locked?: boolean;
  zIndex?: number;
};

export type WhiteboardStroke = WhiteboardElementBase & {
  type: "stroke";
  points: WhiteboardPoint[];
  lineWidth: number;
  opacity: number;
};

export type WhiteboardShapeElement = WhiteboardElementBase & {
  type: "shape";
  shape: WhiteboardShapeKind;
  from: WhiteboardPoint;
  to: WhiteboardPoint;
  lineWidth: number;
};

export type WhiteboardTextElement = WhiteboardElementBase & {
  type: "text";
  at: WhiteboardPoint;
  text: string;
  fontSize: number;
};

export type WhiteboardTodoElement = WhiteboardElementBase & {
  type: "todo";
  at: WhiteboardPoint;
  text: string;
  checked: boolean;
  fontSize: number;
  subtasks: Array<{
    id: string;
    text: string;
    checked: boolean;
  }>;
};

export type WhiteboardStickyElement = WhiteboardElementBase & {
  type: "sticky";
  at: WhiteboardPoint;
  width: number;
  height: number;
  text: string;
  fillColor: string;
};

export type WhiteboardConnectorElement = WhiteboardElementBase & {
  type: "connector";
  fromElementId: string;
  toElementId: string;
  lineWidth: number;
  /** Optional manual bend points; when omitted, connector uses auto-routing. */
  waypoints?: WhiteboardPoint[];
};

export type WhiteboardFrameElement = WhiteboardElementBase & {
  type: "frame";
  at: WhiteboardPoint;
  width: number;
  height: number;
  title: string;
};

export type WhiteboardCommentElement = WhiteboardElementBase & {
  type: "comment";
  at: WhiteboardPoint;
  text: string;
  resolved: boolean;
  replies: Array<{
    id: string;
    author: string;
    text: string;
    createdAt: number;
  }>;
};

export type WhiteboardElement =
  | WhiteboardStroke
  | WhiteboardShapeElement
  | WhiteboardTextElement
  | WhiteboardTodoElement
  | WhiteboardStickyElement
  | WhiteboardConnectorElement
  | WhiteboardFrameElement
  | WhiteboardCommentElement;

/** Participant -> server: add a stroke to the shared whiteboard. */
export type WhiteboardElementAddPayload = {
  roomId: string;
  element: WhiteboardElement;
};

/** Participant -> server (host or element owner): update a specific element. */
export type WhiteboardElementUpdatePayload = {
  roomId: string;
  element: WhiteboardElement;
};

/** Participant -> server (host or element owner): remove a specific element. */
export type WhiteboardElementDeletePayload = {
  roomId: string;
  elementId: string;
};

/** Host -> server: clear all strokes. */
export type WhiteboardClearPayload = {
  roomId: string;
};

/** Server -> joiner on admission: full whiteboard history. */
export type WhiteboardElementsStatePayload = {
  roomId: string;
  elements: WhiteboardElement[];
};

/** Host -> server: replace all whiteboard elements (used for import). */
export type WhiteboardElementsReplacePayload = {
  roomId: string;
  elements: WhiteboardElement[];
};

export type WhiteboardCursorState = {
  socketId: string;
  participantName: string;
  x: number;
  y: number;
  updatedAt: number;
};

/** Participant -> server: update their cursor position. */
export type WhiteboardCursorMovePayload = {
  roomId: string;
  cursor: WhiteboardCursorState;
};

/** Server -> room: full cursor list state. */
export type WhiteboardCursorStatePayload = {
  roomId: string;
  cursors: WhiteboardCursorState[];
};

// ── Webinar mode ────────────────────────────────────────────────────────────

/** Host -> server: toggle webinar mode on/off. */
export type SetWebinarModePayload = {
  roomId: string;
  enabled: boolean;
};

/** Server -> room: webinar state update. */
export type WebinarStatePayload = {
  roomId: string;
  webinarMode: boolean;
  presenterSocketIds: string[];
};

/** Host -> server: grant presenter rights to an attendee. */
export type PromoteToPresenterPayload = {
  roomId: string;
  targetSocketId: string;
};

/** Host -> server: revoke presenter rights. */
export type DemoteToAttendeePayload = {
  roomId: string;
  targetSocketId: string;
};

// ── E2EE phase-1 ───────────────────────────────────────────────────────────

export type E2eeRoomStatePayload = {
  enabled: boolean;
  keyEpoch: number;
  keyFingerprint: string | null;
  algorithm: "xor-v1";
  ackedParticipantCount?: number;
  expectedParticipantCount?: number;
  lastAckedSocketId?: string | null;
};

/** Host -> server: publish next key epoch and key material to relay to peers. */
export type E2eeKeyOfferPayload = {
  roomId: string;
  keyEpoch: number;
  keyMaterialB64: string;
  keyFingerprint: string;
  algorithm: "xor-v1";
};

/** Server -> room: key update event for insertable-stream hooks. */
export type E2eeKeyUpdatePayload = E2eeKeyOfferPayload;

/** Peer -> server (optionally forwarded): indicates local key activation. */
export type E2eeKeyAckPayload = {
  roomId: string;
  keyEpoch: number;
  socketId: string;
  ackedParticipantCount?: number;
  expectedParticipantCount?: number;
  lastAckedSocketId?: string | null;
};

// ── Emotion detection ───────────────────────────────────────────────────────

/** Client -> server -> peers: broadcast detected emotion for a participant. */
export type EmotionUpdatePayload = {
  roomId: string;
  socketId: string;
  /** null = face not detected / feature disabled */
  emotion: string | null;
};
