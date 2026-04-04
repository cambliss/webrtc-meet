import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { parse as parseCookie } from "cookie";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import http from "http";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createSocket } from "node:dgram";
import path from "node:path";
import * as mediasoup from "mediasoup";
import { Server, type Socket } from "socket.io";

import type { UserRole } from "../src/types/auth";
import { verifyAuthToken } from "../src/lib/auth";
import { getDbPool } from "../src/lib/db";
import {
  closeJoinSessionBySocketId,
  createJoinSession,
  createMeetingInviteToken,
  createSecurityBlock,
  createSecurityEvent,
  ensureMeetingSecuritySchema,
  incrementInviteTokenUsage,
  isBlocked,
  isMeetingLocked,
  resolveInviteToken,
  resolveMeetingByIdOrRoomId,
  setMeetingLock,
} from "../src/lib/meetingSecurity";
import type { MeetingFileShare, TranscriptLine } from "../src/types/meeting";
import type {
  AdmitParticipantPayload,
  AdmissionDecisionPayload,
  ChatMessageDeletePayload,
  ChatMessageEditPayload,
  ChatMessagePinPayload,
  ChatMessageSeenPayload,
  ChatPayload,
  ChatMessageReactionPayload,
  ChatTypingPayload,
  FileSharedPayload,
  ConnectWebRtcTransportPayload,
  ConsumePayload,
  CreateWebRtcTransportPayload,
  HandRaisedUpdatePayload,
  JoinRoomPayload,
  JoinRoomResponsePayload,
  LowerHandPayload,
  PresenceUpdatePayload,
  ProducePayload,
  RaiseHandPayload,
  ReactionEventPayload,
  RejectParticipantPayload,
  ResumeConsumerPayload,
  HostSecurityActionPayload,
  SecurityAlertPayload,
  SendReactionPayload,
  StartRecordingPayload,
  StartTranscriptionPayload,
  StopRecordingPayload,
  StopTranscriptionPayload,
  WaitingRoomParticipant,
  WaitingRoomUpdatePayload,
  WebRtcTransportParams,
  // Breakout rooms
  CreateBreakoutRoomsPayload,
  AssignBreakoutPayload,
  CloseBreakoutRoomsPayload,
  BreakoutRoom,
  BreakoutUpdatePayload,
  BreakoutAssignedPayload,
  BreakoutClosedPayload,
  // Whiteboard
  WhiteboardElement,
  WhiteboardElementAddPayload,
  WhiteboardElementUpdatePayload,
  WhiteboardElementDeletePayload,
  WhiteboardClearPayload,
  WhiteboardElementsStatePayload,
  WhiteboardElementsReplacePayload,
  WhiteboardCursorMovePayload,
  WhiteboardCursorStatePayload,
  WhiteboardCursorState,
  // Webinar
  SetWebinarModePayload,
  WebinarStatePayload,
  PromoteToPresenterPayload,
  DemoteToAttendeePayload,
  E2eeKeyAckPayload,
  E2eeKeyOfferPayload,
  E2eeRoomStatePayload,
  EmotionUpdatePayload,
} from "../src/types/socket";
import { requireServiceAuthExpress, type ServiceAuthedRequest } from "./lib/serviceAuth";
import { workspaceRouter } from "./routes/workspaces";
import { DeepgramSpeechToTextService } from "./transcription/deepgram";
import type { SpeechStream, SpeechToTextService } from "./transcription/types";

dotenv.config({ path: ".env.local" });
dotenv.config();

const defaultAllowedOrigins = ["http://localhost:3000", "http://localhost:3001", "https://theofficeconnect.com", "https://www.theofficeconnect.com"];
const normalizeOrigin = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    // Accept plain origins that may not include protocol in env by normalizing slashes/casing.
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
};

const configuredOrigins = [
  process.env.CLIENT_ORIGIN,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.APP_URL,
]
  .filter((value): value is string => Boolean(value))
  .flatMap((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
  .map((value) => normalizeOrigin(value))
  .filter((value): value is string => Boolean(value));

const allowedOrigins = Array.from(
  new Set(
    [...defaultAllowedOrigins, ...configuredOrigins]
      .map((value) => normalizeOrigin(value))
      .filter((value): value is string => Boolean(value)),
  ),
);

const isOriginAllowed = (origin: string | undefined) => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin ? allowedOrigins.includes(normalizedOrigin) : false;
};

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin denied"));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(workspaceRouter);

const internalRouter = express.Router();
internalRouter.use(
  requireServiceAuthExpress({
    audience: "signaling-internal",
    requiredScopes: ["internal:read"],
  }),
);

internalRouter.get("/zero-trust/ping", (req, res) => {
  const identity = (req as ServiceAuthedRequest).serviceIdentity;
  res.json({
    ok: true,
    service: identity?.claims.service || null,
    scopes: Array.from(identity?.scopes || []),
    workspaceId: identity?.claims.workspaceId || null,
    mtlsBound: Boolean(identity?.claims.cnf?.["x5t#S256"]),
    mode: process.env.SERVICE_AUTH_MODE || "optional",
  });
});

internalRouter.post(
  "/participants/avatar-sync",
  requireServiceAuthExpress({
    audience: "signaling-internal",
    requiredScopes: ["internal:presence-write"],
  }),
  (req, res) => {
    const { userId, avatarPath, avatarVersion } = (req.body || {}) as {
      userId?: string;
      avatarPath?: string | null;
      avatarVersion?: number | null;
    };

    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    let updatedPeerCount = 0;
    let updatedWaitingCount = 0;

    for (const [roomId, room] of rooms.entries()) {
      for (const peer of room.peers.values()) {
        if (peer.participant.userId !== userId) {
          continue;
        }

        if (
          peer.participant.avatarPath === (avatarPath ?? null) &&
          (peer.participant.avatarVersion ?? null) === (avatarVersion ?? null)
        ) {
          continue;
        }

        peer.participant = {
          ...peer.participant,
          avatarPath: avatarPath ?? null,
          avatarVersion: avatarVersion ?? null,
        };
        updatedPeerCount += 1;
        io.to(roomId).emit("presence-updated", peer.participant);
      }

      let waitingChanged = false;
      for (const [socketId, participant] of room.waitingRoom.entries()) {
        if (participant.userId !== userId) {
          continue;
        }

        if (
          (participant.avatarPath ?? null) === (avatarPath ?? null) &&
          (participant.avatarVersion ?? null) === (avatarVersion ?? null)
        ) {
          continue;
        }

        room.waitingRoom.set(socketId, {
          ...participant,
          avatarPath: avatarPath ?? null,
          avatarVersion: avatarVersion ?? null,
        });
        updatedWaitingCount += 1;
        waitingChanged = true;
      }

      if (waitingChanged) {
        const waitingPayload: WaitingRoomUpdatePayload = {
          roomId,
          waiting: Array.from(room.waitingRoom.values()),
        };
        io.to(roomId).emit("waiting-room-update", waitingPayload);
      }
    }

    res.json({
      ok: true,
      updatedPeerCount,
      updatedWaitingCount,
    });
  },
);

app.use("/internal", internalRouter);

const server = http.createServer(app);

const io = new Server(server, {
  path: "/socket.io/",
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin denied"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.engine.on("connection_error", (error) => {
  const request = error.req;
  console.warn("[Socket.IO] connection_error", {
    code: error.code,
    message: error.message,
    method: request?.method,
    url: request?.url,
    origin: request?.headers?.origin,
    upgrade: request?.headers?.upgrade,
    connection: request?.headers?.connection,
    xForwardedProto: request?.headers?.["x-forwarded-proto"],
  });
});

type ServerParticipant = {
  socketId: string;
  userId: string;
  username: string;
  role: UserRole;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  avatarPath: string | null;
  avatarVersion: number | null;
  invitedByUserId: string | null;
  invitedByName: string | null;
  deviceFingerprint: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  joinSessionId: string | null;
};

type RoomPeer = {
  participant: ServerParticipant;
  inviteTokenId: string | null;
  joinSessionId: string | null;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  producersByKind: Map<"audio" | "video", string>;
  consumers: Map<string, mediasoup.types.Consumer>;
  consumersByProducerId: Map<string, string>;
};

type RoomState = {
  router: mediasoup.types.Router;
  audioLevelObserver: mediasoup.types.AudioLevelObserver;
  peers: Map<string, RoomPeer>;
  hostSocketId: string | null;
  hostUserId: string | null;
  activeSpeakerSocketId: string | null;
  recordingSession: RecordingSession | null;
  transcriptionSession: TranscriptionSession | null;
  chatHistory: import("../src/types/meeting").ChatMessage[];
  transcriptHistory: TranscriptLine[];
  fileShareHistory: MeetingFileShare[];
  waitingRoom: Map<string, WaitingRoomParticipant>;
  admittedSocketIds: Set<string>;
  raisedHands: Set<string>;
  // Breakout rooms
  breakoutRooms: Map<string, string[]>; // breakoutRoomId -> [socketId]
  breakoutAssignments: Map<string, string>; // socketId -> breakoutRoomId
  // Whiteboard
  whiteboardElements: WhiteboardElement[];
  whiteboardCursors: Map<string, WhiteboardCursorState>;
  // Webinar mode
  webinarMode: boolean;
  presenterSocketIds: Set<string>;
  // E2EE phase-1 state (key relay contract; media transforms run on clients)
  e2ee: E2eeRoomStatePayload & {
    keyOwnerSocketId: string | null;
    ackedSocketIds: Set<string>;
  };
};

function getE2eeAckState(room: RoomState): Pick<
  E2eeRoomStatePayload,
  "ackedParticipantCount" | "expectedParticipantCount" | "lastAckedSocketId"
> {
  return {
    ackedParticipantCount: room.e2ee.ackedSocketIds.size,
    expectedParticipantCount: room.peers.size,
    lastAckedSocketId: room.e2ee.lastAckedSocketId || null,
  };
}

type RecordingSession = {
  ffmpeg: ChildProcessWithoutNullStreams;
  filePath: string;
  requesterSocketId: string;
  targetSocketId: string;
  audioTransport: mediasoup.types.PlainTransport;
  videoTransport: mediasoup.types.PlainTransport;
  audioConsumer: mediasoup.types.Consumer;
  videoConsumer: mediasoup.types.Consumer;
};

function escapeFfmpegDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

type ParticipantTranscriptionSession = {
  socketId: string;
  transport: mediasoup.types.PlainTransport;
  consumer: mediasoup.types.Consumer;
  ffmpeg: ChildProcessWithoutNullStreams;
  speechStream: SpeechStream;
};

type TranscriptionSession = {
  startedBySocketId: string;
  service: SpeechToTextService;
  participantSessions: Map<string, ParticipantTranscriptionSession>;
};

const rooms = new Map<string, RoomState>();
let worker: mediasoup.types.Worker;
type TransportDirection = "send" | "recv";

const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    preferredPayloadType: 111,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    preferredPayloadType: 96,
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 },
  },
];

async function initWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 49999),
  });

  worker.on("died", () => {
    console.error("mediasoup worker died, exiting in 2 seconds...");
    setTimeout(() => process.exit(1), 2000);
  });
}

async function getOrCreateRoom(roomId: string): Promise<RoomState> {
  if (!rooms.has(roomId)) {
    const router = await worker.createRouter({ mediaCodecs });
    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 1,
      threshold: -70,
      interval: 800,
    });

    rooms.set(roomId, {
      router,
      audioLevelObserver,
      peers: new Map(),
      hostSocketId: null,
      hostUserId: null,
      activeSpeakerSocketId: null,
      recordingSession: null,
      transcriptionSession: null,
      chatHistory: [],
      transcriptHistory: [],
      fileShareHistory: [],
      waitingRoom: new Map(),
      admittedSocketIds: new Set(),
      raisedHands: new Set(),
      breakoutRooms: new Map(),
      breakoutAssignments: new Map(),
      whiteboardElements: [],
      whiteboardCursors: new Map(),
      webinarMode: false,
      presenterSocketIds: new Set(),
      e2ee: {
        enabled: String(process.env.E2EE_PHASE1_ENABLED || "false").toLowerCase() === "true",
        keyEpoch: 0,
        keyFingerprint: null,
        algorithm: "xor-v1",
        keyOwnerSocketId: null,
        lastAckedSocketId: null,
        ackedSocketIds: new Set(),
      },
    });

    audioLevelObserver.on("volumes", (volumes) => {
      const topSpeaker = volumes[0];
      const producer = topSpeaker?.producer;
      const socketId = producer?.appData?.socketId as string | undefined;

      if (!socketId) {
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        return;
      }

      room.activeSpeakerSocketId = socketId;
      io.to(roomId).emit("active-speaker", {
        socketId,
        volume: topSpeaker.volume,
      });

      void prioritizeActiveSpeakerLayers(room, socketId);
    });

    audioLevelObserver.on("silence", () => {
      const room = rooms.get(roomId);
      if (!room) {
        return;
      }

      room.activeSpeakerSocketId = null;
      io.to(roomId).emit("active-speaker", { socketId: null, volume: null });
    });
  }

  return rooms.get(roomId)!;
}

async function canUserJoinMeetingByRoomId(roomId: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query<{ can_join: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM meetings m
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = m.workspace_id
       AND wm.user_id = $1
      WHERE (m.id::text = $2 OR m.room_id = $2)
        AND (wm.user_id IS NOT NULL OR EXISTS (
          SELECT 1
          FROM workspaces w
          WHERE w.id = m.workspace_id
            AND w.owner_id = $1
        ))
    ) AS can_join
    `,
    [userId, roomId],
  );

  return result.rows[0]?.can_join ?? false;
}

async function resolveAvatarPathByUserId(userId: string): Promise<string | null> {
  const pool = getDbPool();
  try {
    const result = await pool.query<{ avatar_path: string | null }>(
      "SELECT avatar_path FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );

    return result.rows[0]?.avatar_path ?? null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42703"
    ) {
      console.warn("users.avatar_path column is missing; falling back to no avatar.");
      return null;
    }

    throw error;
  }
}

type WorkspacePlanLimits = {
  workspaceId: string;
  maxParticipants: number | null;
  maxMeetingMinutes: number | null;
  recordingEnabled: boolean;
  startedAt: string;
};

async function markMeetingStarted(roomId: string): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE meetings
    SET
      started_at = COALESCE(started_at, NOW()),
      status = 'live'
    WHERE id::text = $1 OR room_id = $1
    `,
    [roomId],
  );
}

async function getWorkspacePlanLimitsByRoomId(roomId: string): Promise<WorkspacePlanLimits | null> {
  const pool = getDbPool();
  const result = await pool.query<{
    workspace_id: string;
    max_participants: number | null;
    max_meeting_minutes: number | null;
    recording_enabled: boolean;
    started_at: string;
  }>(
    `
    WITH active_sub AS (
      SELECT s.*
      FROM subscriptions s
      WHERE s.workspace_id = (
        SELECT workspace_id FROM meetings WHERE id::text = $1 OR room_id = $1 LIMIT 1
      )
        AND s.status = 'active'
        AND s.start_date <= NOW()
        AND (s.end_date IS NULL OR s.end_date >= NOW())
      ORDER BY s.start_date DESC
      LIMIT 1
    )
    SELECT
      m.workspace_id,
      COALESCE(p.max_participants, fp.max_participants) AS max_participants,
      COALESCE(p.max_meeting_minutes, fp.max_meeting_minutes) AS max_meeting_minutes,
      COALESCE(p.recording_enabled, fp.recording_enabled) AS recording_enabled,
      COALESCE(m.started_at, m.created_at)::text AS started_at
    FROM meetings m
    LEFT JOIN active_sub s ON TRUE
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN plans fp ON fp.id = 'free'
    WHERE m.id::text = $1 OR m.room_id = $1
    LIMIT 1
    `,
    [roomId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    workspaceId: row.workspace_id,
    maxParticipants: row.max_participants,
    maxMeetingMinutes: row.max_meeting_minutes,
    recordingEnabled: row.recording_enabled,
    startedAt: row.started_at,
  };
}

function getSocketAuth(socket: Socket) {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookie(cookieHeader);
  const token = cookies.meeting_token;
  if (!token) {
    return null;
  }

  return verifyAuthToken(token);
}

function normalizeIpAddress(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/^::ffff:/, "").trim();
  return normalized || null;
}

function detectDeviceType(userAgent: string | undefined): string {
  if (!userAgent) {
    return "unknown";
  }

  const ua = userAgent.toLowerCase();
  if (ua.includes("ipad") || ua.includes("tablet")) {
    return "tablet";
  }
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
    return "mobile";
  }
  return "desktop";
}

function parseBrowserAndOs(userAgent: string | undefined): {
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
} {
  if (!userAgent) {
    return {
      browserName: null,
      browserVersion: null,
      osName: null,
      osVersion: null,
    };
  }

  const ua = userAgent;
  const browserMatch =
    ua.match(/Edg\/(\d+[\.\d]*)/) ||
    ua.match(/Chrome\/(\d+[\.\d]*)/) ||
    ua.match(/Firefox\/(\d+[\.\d]*)/) ||
    ua.match(/Version\/(\d+[\.\d]*).*Safari/);

  let browserName: string | null = null;
  if (ua.includes("Edg/")) {
    browserName = "Edge";
  } else if (ua.includes("Chrome/")) {
    browserName = "Chrome";
  } else if (ua.includes("Firefox/")) {
    browserName = "Firefox";
  } else if (ua.includes("Safari/") && ua.includes("Version/")) {
    browserName = "Safari";
  }

  const browserVersion = browserMatch?.[1] || null;

  let osName: string | null = null;
  let osVersion: string | null = null;
  if (ua.includes("Windows NT")) {
    osName = "Windows";
    osVersion = ua.match(/Windows NT ([\d\.]+)/)?.[1] || null;
  } else if (ua.includes("Mac OS X")) {
    osName = "macOS";
    osVersion = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") || null;
  } else if (ua.includes("Android")) {
    osName = "Android";
    osVersion = ua.match(/Android ([\d\.]+)/)?.[1] || null;
  } else if (ua.includes("iPhone OS") || ua.includes("iPad; CPU OS")) {
    osName = "iOS";
    osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || null;
  } else if (ua.includes("Linux")) {
    osName = "Linux";
  }

  return {
    browserName,
    browserVersion,
    osName,
    osVersion,
  };
}

function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

async function getFreeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const udp = createSocket("udp4");

    udp.once("error", (error) => {
      udp.close();
      reject(error);
    });

    udp.bind(0, "127.0.0.1", () => {
      const address = udp.address();
      udp.close();

      if (typeof address === "string") {
        reject(new Error("Could not allocate UDP port"));
        return;
      }

      resolve(address.port);
    });
  });
}

function codecNameFromMimeType(mimeType: string): string {
  const [, codec] = mimeType.split("/");
  return (codec || "OPUS").toUpperCase();
}

function resolveFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function isFfmpegAvailable(): boolean {
  const ffmpegPath = resolveFfmpegPath();
  const result = spawnSync(ffmpegPath, ["-version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/** Detected GPU encoder information */
interface GpuEncoderInfo {
  codec: string;
  container: "webm" | "mp4";
  ext: ".webm" | ".mp4";
}

/** Detect available GPU video encoder and fall back to CPU if none found */
function detectGpuVideoEncoder(): GpuEncoderInfo {
  // Check environment override first
  const override = process.env.RECORDING_GPU_ENCODER?.trim();
  if (override) {
    if (override === "h264_nvenc" || override === "h264_vaapi" || override === "h264_videotoolbox") {
      return { codec: override, container: "mp4", ext: ".mp4" };
    }
    if (override === "libvpx") {
      return { codec: override, container: "webm", ext: ".webm" };
    }
  }

  try {
    const ffmpegPath = resolveFfmpegPath();
    const result = spawnSync(ffmpegPath, ["-encoders", "-hide_banner"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (!result.error && result.status === 0 && result.stdout) {
      const stdout = result.stdout as string;
      // Check for GPU encoders in priority order
      if (stdout.includes("h264_nvenc")) {
        return { codec: "h264_nvenc", container: "mp4", ext: ".mp4" };
      }
      if (stdout.includes("h264_vaapi")) {
        return { codec: "h264_vaapi", container: "mp4", ext: ".mp4" };
      }
      if (stdout.includes("h264_videotoolbox")) {
        return { codec: "h264_videotoolbox", container: "mp4", ext: ".mp4" };
      }
    }
  } catch {
    // Silently fall through to CPU encoder if detection fails
  }

  // Default CPU encoder
  return { codec: "libvpx", container: "webm", ext: ".webm" };
}

/** Cached GPU encoder info */
const GPU_ENCODER: GpuEncoderInfo = detectGpuVideoEncoder();

console.log(`[Recording] Using video encoder: ${GPU_ENCODER.codec} (${GPU_ENCODER.container})`);

function createRecordingSdp(params: {
  audioPort: number;
  audioRtcpPort: number;
  audioCodecPayloadType: number;
  audioCodecName: string;
  audioClockRate: number;
  audioChannels: number;
  videoPort: number;
  videoRtcpPort: number;
  videoCodecPayloadType: number;
  videoCodecName: string;
  videoClockRate: number;
}) {
  return [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=Mediasoup Recording",
    "c=IN IP4 127.0.0.1",
    "t=0 0",
    `m=audio ${params.audioPort} RTP/AVP ${params.audioCodecPayloadType}`,
    `a=rtcp:${params.audioRtcpPort}`,
    `a=rtpmap:${params.audioCodecPayloadType} ${params.audioCodecName}/${params.audioClockRate}/${params.audioChannels}`,
    "a=recvonly",
    `m=video ${params.videoPort} RTP/AVP ${params.videoCodecPayloadType}`,
    `a=rtcp:${params.videoRtcpPort}`,
    `a=rtpmap:${params.videoCodecPayloadType} ${params.videoCodecName}/${params.videoClockRate}`,
    "a=recvonly",
    "",
  ].join("\n");
}

function closeRecordingSession(session: RecordingSession) {
  session.audioConsumer.close();
  session.videoConsumer.close();
  session.audioTransport.close();
  session.videoTransport.close();

  if (!session.ffmpeg.killed) {
    session.ffmpeg.kill("SIGINT");
  }
}

function createTranscriptionSdp(params: {
  audioPort: number;
  audioRtcpPort: number;
  audioCodecPayloadType: number;
  audioCodecName: string;
  audioClockRate: number;
  audioChannels: number;
}) {
  return [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=Mediasoup Transcription",
    "c=IN IP4 127.0.0.1",
    "t=0 0",
    `m=audio ${params.audioPort} RTP/AVP ${params.audioCodecPayloadType}`,
    `a=rtcp:${params.audioRtcpPort}`,
    `a=rtpmap:${params.audioCodecPayloadType} ${params.audioCodecName}/${params.audioClockRate}/${params.audioChannels}`,
    "a=recvonly",
    "",
  ].join("\n");
}

function closeParticipantTranscriptionSession(session: ParticipantTranscriptionSession) {
  session.consumer.close();
  session.transport.close();
  session.speechStream.close();

  if (!session.ffmpeg.killed) {
    session.ffmpeg.kill("SIGINT");
  }
}

function closeTranscriptionSession(session: TranscriptionSession) {
  session.participantSessions.forEach((participantSession) => {
    closeParticipantTranscriptionSession(participantSession);
  });

  session.participantSessions.clear();
}

async function attachParticipantTranscription(
  roomId: string,
  room: RoomState,
  participantSocketId: string,
  producer: mediasoup.types.Producer,
) {
  const transcription = room.transcriptionSession;
  if (!transcription) {
    return;
  }

  const participant = room.peers.get(participantSocketId)?.participant;
  if (!participant) {
    return;
  }

  const existingSession = transcription.participantSessions.get(participantSocketId);
  if (existingSession) {
    closeParticipantTranscriptionSession(existingSession);
    transcription.participantSessions.delete(participantSocketId);
  }

  const [audioPort, audioRtcpPort] = await Promise.all([getFreeUdpPort(), getFreeUdpPort()]);

  const transport = await room.router.createPlainTransport({
    listenIp: "127.0.0.1",
    comedia: false,
    rtcpMux: false,
  });

  await transport.connect({ ip: "127.0.0.1", port: audioPort, rtcpPort: audioRtcpPort });

  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities: room.router.rtpCapabilities,
    paused: true,
  });

  const audioCodec = consumer.rtpParameters.codecs[0];
  if (!audioCodec) {
    consumer.close();
    transport.close();
    return;
  }

  const sdp = createTranscriptionSdp({
    audioPort,
    audioRtcpPort,
    audioCodecPayloadType: audioCodec.payloadType,
    audioCodecName: codecNameFromMimeType(audioCodec.mimeType),
    audioClockRate: audioCodec.clockRate,
    audioChannels: audioCodec.channels || 2,
  });

  const speechStream = transcription.service.createStream({
    onTranscript: ({ text, isFinal }) => {
      const line: TranscriptLine = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        roomId,
        socketId: participantSocketId,
        speakerName: participant.username,
        text,
        isFinal,
        createdAt: Date.now(),
      };

      room.transcriptHistory.push(line);
      io.to(roomId).emit("transcript-line", line);
    },
    onError: () => undefined,
  });

  const ffmpegPath = resolveFfmpegPath();
  const ffmpeg = spawn(ffmpegPath, [
    "-protocol_whitelist",
    "file,udp,rtp,pipe",
    "-f",
    "sdp",
    "-i",
    "pipe:0",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "s16le",
    "pipe:1",
  ]);

  let ffmpegFailed = false;

  ffmpeg.on("error", (error) => {
    ffmpegFailed = true;
    console.error("Transcription ffmpeg process failed", error);

    const latestRoom = rooms.get(roomId);
    latestRoom?.transcriptionSession?.participantSessions.delete(participantSocketId);

    speechStream.close();
    consumer.close();
    transport.close();
  });

  if (ffmpegFailed) {
    return;
  }

  ffmpeg.stdin.write(sdp);
  ffmpeg.stdin.end();

  ffmpeg.stdout.on("data", (chunk: Buffer) => {
    speechStream.sendAudio(chunk);
  });

  ffmpeg.on("exit", () => {
    const latestRoom = rooms.get(roomId);
    const latestSession = latestRoom?.transcriptionSession?.participantSessions.get(participantSocketId);
    if (!latestSession) {
      return;
    }

    latestRoom?.transcriptionSession?.participantSessions.delete(participantSocketId);
  });

  if (ffmpegFailed) {
    return;
  }

  await consumer.resume();

  transcription.participantSessions.set(participantSocketId, {
    socketId: participantSocketId,
    transport,
    consumer,
    ffmpeg,
    speechStream,
  });
}

function findProducerOwnerSocket(room: RoomState, producerId: string): string | null {
  for (const [ownerSocketId, peer] of room.peers.entries()) {
    if (peer.producers.has(producerId)) {
      return ownerSocketId;
    }
  }

  return null;
}

function getScoreNumber(scorePayload: unknown): number {
  if (typeof scorePayload === "number") {
    return scorePayload;
  }

  if (scorePayload && typeof scorePayload === "object") {
    const maybeScore = (scorePayload as { score?: unknown; producerScore?: unknown }).score;
    if (typeof maybeScore === "number") {
      return maybeScore;
    }

    const maybeProducerScore = (scorePayload as { producerScore?: unknown }).producerScore;
    if (typeof maybeProducerScore === "number") {
      return maybeProducerScore;
    }
  }

  return 10;
}

async function applyAdaptiveLayers(consumer: mediasoup.types.Consumer, scorePayload: unknown) {
  if (consumer.kind !== "video") {
    return;
  }

  const score = getScoreNumber(scorePayload);
  if (score >= 8) {
    await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
    return;
  }

  if (score >= 5) {
    await consumer.setPreferredLayers({ spatialLayer: 1, temporalLayer: 2 });
    return;
  }

  await consumer.setPreferredLayers({ spatialLayer: 0, temporalLayer: 1 });
}

async function prioritizeActiveSpeakerLayers(room: RoomState, activeSpeakerSocketId: string) {
  const layerUpdates: Promise<void>[] = [];

  for (const peer of room.peers.values()) {
    for (const consumer of peer.consumers.values()) {
      if (consumer.kind !== "video") {
        continue;
      }

      const producerOwnerSocketId = findProducerOwnerSocket(room, consumer.producerId);
      if (!producerOwnerSocketId) {
        continue;
      }

      const targetLayers =
        producerOwnerSocketId === activeSpeakerSocketId
          ? { spatialLayer: 2, temporalLayer: 2 }
          : { spatialLayer: 1, temporalLayer: 1 };

      layerUpdates.push(
        consumer
          .setPreferredLayers(targetLayers)
          .catch(() => undefined) as Promise<void>,
      );
    }
  }

  await Promise.all(layerUpdates);
}

async function createWebRtcTransport(
  router: mediasoup.types.Router,
  direction: TransportDirection,
  socketId: string,
) {
  const listenIp = process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0";
  const announcedAddress = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;

  const transport = await router.createWebRtcTransport({
    listenInfos: [
      { protocol: "udp", ip: listenIp, announcedAddress },
      { protocol: "tcp", ip: listenIp, announcedAddress },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    appData: {
      direction,
      socketId,
    },
  } as never);

  const params: WebRtcTransportParams = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };

  return { transport, params };
}

function closePeerResources(peer: RoomPeer) {
  peer.consumers.forEach((consumer) => consumer.close());
  peer.producers.forEach((producer) => producer.close());
  peer.transports.forEach((transport) => transport.close());
  peer.producersByKind.clear();
  peer.consumersByProducerId.clear();
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log(`[signaling] socket connected  id=${socket.id}  origin=${socket.handshake.headers.origin || "<none>"}`);

  socket.on("join-room", async (payload: JoinRoomPayload, callback) => {
    await ensureMeetingSecuritySchema();

    const meeting = await resolveMeetingByIdOrRoomId(payload.roomId);
    if (!meeting) {
      callback({ error: "Meeting not found" });
      return;
    }

    const userAgentHeader =
      payload.userAgent ||
      (typeof socket.handshake.headers["user-agent"] === "string"
        ? socket.handshake.headers["user-agent"]
        : "");
    const ipAddress = normalizeIpAddress(socket.handshake.address as string | undefined);
    const deviceFingerprint = payload.deviceFingerprint?.trim() || null;
    const deviceType = detectDeviceType(userAgentHeader);
    const parsedUa = parseBrowserAndOs(userAgentHeader);

    const blocked = await isBlocked({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.meetingId,
      deviceFingerprint,
      ipAddress,
    });

    console.log(`[join-room] room=${payload.roomId} user=${payload.userId} username="${payload.username}" role=${payload.role} inviteToken=${payload.inviteToken ? payload.inviteToken.slice(0, 8) + "…" : "none"}`);

    if (blocked.blocked) {
      const joinSessionId = await createJoinSession({
        meetingId: meeting.meetingId,
        workspaceId: meeting.workspaceId,
        participantUserId: payload.userId || null,
        participantDisplayName: (payload.username || "Unknown").trim().slice(0, 40) || "Unknown",
        socketId: socket.id,
        deviceFingerprint,
        userAgent: userAgentHeader,
        browserName: parsedUa.browserName,
        browserVersion: parsedUa.browserVersion,
        osName: parsedUa.osName,
        osVersion: parsedUa.osVersion,
        deviceType,
        ipAddress,
        decision: "blocked",
        decisionReason: blocked.reason || "Blocked device/IP",
        sessionTokenHash: hashSessionToken(payload.clientSessionId || randomUUID()),
      });

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        joinSessionId,
        eventType: "blocked_join_attempt",
        severity: "critical",
        participantDisplayName: (payload.username || "Unknown").trim().slice(0, 40) || "Unknown",
        deviceFingerprint,
        ipAddress,
        metadata: { reason: blocked.reason || "Blocked device/IP" },
      });

      console.warn(`[join-room] BLOCKED room=${payload.roomId} user=${payload.userId} reason=${blocked.reason}`);
      callback({ error: "Blocked by meeting security policy" });
      return;
    }

    const meetingLocked = await isMeetingLocked(meeting.meetingId);
    const auth = getSocketAuth(socket);
    let isWorkspaceMember = false;

    if (auth) {
      isWorkspaceMember = await canUserJoinMeetingByRoomId(payload.roomId, auth.userId);
    }

    const canGuestJoin =
      payload.role === "participant" &&
      typeof payload.username === "string" &&
      payload.username.trim().length >= 2;

    const inviteToken = payload.inviteToken?.trim();
    const inviteRecord = inviteToken
      ? await resolveInviteToken({
          meetingId: meeting.meetingId,
          inviteToken,
        })
      : null;

    const isGuestSession = !auth || !isWorkspaceMember;
    const participantRole: UserRole = isGuestSession ? "participant" : auth.role;
    const participantUserId = isGuestSession
      ? payload.userId || `guest-${socket.id}`
      : auth.userId;
    const participantUsername = (
      isGuestSession ? payload.username || "Guest" : auth.username
    )
      .trim()
      .slice(0, 40);
    const avatarPath = !isGuestSession ? await resolveAvatarPathByUserId(participantUserId) : null;
    const avatarVersion = avatarPath ? Date.now() : null;

    if (meetingLocked && participantRole !== "host") {
      const joinSessionId = await createJoinSession({
        meetingId: meeting.meetingId,
        workspaceId: meeting.workspaceId,
        participantUserId,
        participantDisplayName: participantUsername,
        socketId: socket.id,
        inviteTokenId: inviteRecord?.id || null,
        invitedByUserId: inviteRecord?.inviterUserId || null,
        deviceFingerprint,
        userAgent: userAgentHeader,
        browserName: parsedUa.browserName,
        browserVersion: parsedUa.browserVersion,
        osName: parsedUa.osName,
        osVersion: parsedUa.osVersion,
        deviceType,
        ipAddress,
        decision: "denied",
        decisionReason: "Meeting is locked",
        sessionTokenHash: hashSessionToken(payload.clientSessionId || randomUUID()),
      });

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        joinSessionId,
        eventType: "lock_violation",
        severity: "warning",
        participantDisplayName: participantUsername,
        invitedByUserId: inviteRecord?.inviterUserId || null,
        deviceFingerprint,
        ipAddress,
      });

      callback({ error: "Meeting is locked" });
      return;
    }

    if (!auth && !canGuestJoin) {
      callback({ error: "Unauthorized" });
      return;
    }

    if (auth && !isWorkspaceMember) {
      if (auth.role === "host" || !canGuestJoin) {
        callback({ error: "Forbidden: not a workspace member for this meeting" });
        return;
      }
    }

    const room = await getOrCreateRoom(payload.roomId);

    if (auth?.role === "host" && isWorkspaceMember && room.peers.size === 0) {
      await markMeetingStarted(payload.roomId);
    }

    const limits = await getWorkspacePlanLimitsByRoomId(payload.roomId);
    if (!limits) {
      callback({ error: "Meeting not found" });
      return;
    }

    if (limits.maxParticipants !== null && room.peers.size >= limits.maxParticipants) {
      callback({ error: `Participant limit reached for current plan (${limits.maxParticipants})` });
      return;
    }

    if (limits.maxMeetingMinutes !== null) {
      const startedAtMs = new Date(limits.startedAt).getTime();
      const elapsedMs = Date.now() - startedAtMs;
      if (elapsedMs >= limits.maxMeetingMinutes * 60 * 1000) {
        callback({
          error: `Meeting duration limit reached (${limits.maxMeetingMinutes} minutes on current plan)`,
        });
        return;
      }
    }

    const joinSessionToken = payload.clientSessionId || randomUUID();
    const unauthorizedGuest = isGuestSession && !inviteRecord;

    const emitSecurityAlertToHost = async (reason: string, severity: "warning" | "critical") => {
      const alert: SecurityAlertPayload = {
        id: randomUUID(),
        roomId: payload.roomId,
        meetingId: meeting.meetingId,
        participantName: participantUsername,
        invitedByName: inviteRecord?.inviterName || null,
        invitedByUserId: inviteRecord?.inviterUserId || null,
        deviceType,
        deviceFingerprint,
        ipAddress,
        reason,
        createdAt: Date.now(),
        targetSocketId: socket.id,
      };

      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit("security-alert", alert);
      }

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        eventType: "unauthorized_join_alert",
        severity,
        participantDisplayName: participantUsername,
        invitedByUserId: inviteRecord?.inviterUserId || null,
        deviceFingerprint,
        ipAddress,
        metadata: {
          reason,
          roomId: payload.roomId,
          socketId: socket.id,
        },
      });
    };

    // Only the actual meeting creator (matching DB host_id) bypasses the waiting room.
    // Workspace admins with role:"host" who join via an invite link must be admitted by the host.
    const isActualMeetingHost = participantRole === "host" && participantUserId === meeting.hostId;
    if (!isActualMeetingHost && !room.admittedSocketIds.has(socket.id)) {
      const waiter: WaitingRoomParticipant = {
        socketId: socket.id,
        userId: participantUserId,
        username: participantUsername,
        avatarPath,
        avatarVersion,
        requestedAt: Date.now(),
      };

      room.waitingRoom.set(socket.id, waiter);

      // Notify all admitted peers (host) about the updated waiting list.
      const waitingList = Array.from(room.waitingRoom.values());
      const updatePayload: WaitingRoomUpdatePayload = {
        roomId: payload.roomId,
        waiting: waitingList,
      };
      io.to(payload.roomId).emit("waiting-room-update", updatePayload);

      const waitingResponse: JoinRoomResponsePayload = {
        status: "waiting",
        roomUsers: [],
        routerRtpCapabilities: null,
        existingProducers: [],
        chatHistory: room.chatHistory,
        transcriptHistory: [],
        fileShareHistory: [],
        e2ee: {
          enabled: room.e2ee.enabled,
          keyEpoch: room.e2ee.keyEpoch,
          keyFingerprint: room.e2ee.keyFingerprint,
          algorithm: room.e2ee.algorithm,
          ...getE2eeAckState(room),
        },
      };

      await createJoinSession({
        meetingId: meeting.meetingId,
        workspaceId: meeting.workspaceId,
        participantUserId,
        participantDisplayName: participantUsername,
        socketId: socket.id,
        inviteTokenId: inviteRecord?.id || null,
        invitedByUserId: inviteRecord?.inviterUserId || null,
        deviceFingerprint,
        userAgent: userAgentHeader,
        browserName: parsedUa.browserName,
        browserVersion: parsedUa.browserVersion,
        osName: parsedUa.osName,
        osVersion: parsedUa.osVersion,
        deviceType,
        ipAddress,
        decision: "waiting",
        decisionReason: unauthorizedGuest ? "Not from invite list" : "Waiting for host admission",
        sessionTokenHash: hashSessionToken(joinSessionToken),
      });

      if (inviteRecord?.id) {
        await incrementInviteTokenUsage(inviteRecord.id);
      }

      if (unauthorizedGuest) {
        await emitSecurityAlertToHost("Participant is not from original invite list", "warning");
      }

      console.log(`[join-room] WAITING room=${payload.roomId} user=${payload.userId} username="${participantUsername}" socketId=${socket.id}`);
      callback(waitingResponse);
      return;
    }

    // Host joins directly; admitted participants consume the same path.
    room.admittedSocketIds.delete(socket.id); // consumed — clean up
    socket.join(payload.roomId);

    const participant: ServerParticipant = {
      socketId: socket.id,
      userId: participantUserId,
      username: participantUsername,
      role: participantRole,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      avatarPath,
      avatarVersion,
      invitedByUserId: inviteRecord?.inviterUserId || null,
      invitedByName: inviteRecord?.inviterName || null,
      deviceFingerprint,
      deviceType,
      ipAddress,
      joinSessionId: null,
    };

    const joinSessionId = await createJoinSession({
      meetingId: meeting.meetingId,
      workspaceId: meeting.workspaceId,
      participantUserId,
      participantDisplayName: participantUsername,
      socketId: socket.id,
      inviteTokenId: inviteRecord?.id || null,
      invitedByUserId: inviteRecord?.inviterUserId || null,
      deviceFingerprint,
      userAgent: userAgentHeader,
      browserName: parsedUa.browserName,
      browserVersion: parsedUa.browserVersion,
      osName: parsedUa.osName,
      osVersion: parsedUa.osVersion,
      deviceType,
      ipAddress,
      decision: "admitted",
      decisionReason: "Admitted",
      sessionTokenHash: hashSessionToken(joinSessionToken),
    });

    participant.joinSessionId = joinSessionId;

    if (inviteRecord?.id) {
      await incrementInviteTokenUsage(inviteRecord.id);
    }

    room.peers.set(socket.id, {
      participant,
      inviteTokenId: inviteRecord?.id || null,
      joinSessionId,
      ipAddress,
      deviceFingerprint,
      transports: new Map(),
      producers: new Map(),
      producersByKind: new Map(),
      consumers: new Map(),
      consumersByProducerId: new Map(),
    });

    if (participantRole === "host") {
      if (!room.hostUserId || room.hostUserId === participantUserId) {
        room.hostUserId = participantUserId;
        room.hostSocketId = socket.id;
      }
    }

    socket.to(payload.roomId).emit("user-joined", participant);

    const users = Array.from(room.peers.values()).map((peer) => peer.participant);
    const existingProducers = Array.from(room.peers.values())
      .flatMap((peer) => Array.from(peer.producers.values()))
      .filter((producer) => producer.appData?.socketId !== socket.id)
      .map((producer) => ({
        producerId: producer.id,
        socketId: producer.appData?.socketId as string | undefined,
        kind: producer.kind,
      }));

    // Send the current waiting list to the freshly-joined host.
    const waitingList = Array.from(room.waitingRoom.values());
    const updatePayload: WaitingRoomUpdatePayload = {
      roomId: payload.roomId,
      waiting: waitingList,
    };
    socket.emit("waiting-room-update", updatePayload);

    const response: JoinRoomResponsePayload = {
      status: "admitted",
      roomUsers: users,
      routerRtpCapabilities: room.router.rtpCapabilities,
      existingProducers,
      chatHistory: room.chatHistory,
      transcriptHistory: room.transcriptHistory,
      fileShareHistory: room.fileShareHistory,
      e2ee: {
        enabled: room.e2ee.enabled,
        keyEpoch: room.e2ee.keyEpoch,
        keyFingerprint: room.e2ee.keyFingerprint,
        algorithm: room.e2ee.algorithm,
        ...getE2eeAckState(room),
      },
    };

    if (unauthorizedGuest) {
      await emitSecurityAlertToHost("Participant admitted but not from original invite list", "warning");
    }

    console.log(`[join-room] ADMITTED room=${payload.roomId} user=${participantUserId} username="${participantUsername}" role=${participantRole} socketId=${socket.id} peers=${room.peers.size} chatHistory=${room.chatHistory.length}`);
    callback(response);

    // Send whiteboard history to the new joiner.
    if (room.whiteboardElements.length > 0) {
      const wbState: WhiteboardElementsStatePayload = {
        roomId: payload.roomId,
        elements: room.whiteboardElements,
      };
      socket.emit("whiteboard-elements-state", wbState);
    }

    if (room.whiteboardCursors.size > 0) {
      const cursorState: WhiteboardCursorStatePayload = {
        roomId: payload.roomId,
        cursors: Array.from(room.whiteboardCursors.values()),
      };
      socket.emit("whiteboard-cursor-state", cursorState);
    }

    // Send webinar state to new joiner if active.
    if (room.webinarMode) {
      const webinarState: WebinarStatePayload = {
        roomId: payload.roomId,
        webinarMode: true,
        presenterSocketIds: Array.from(room.presenterSocketIds),
      };
      socket.emit("webinar-state", webinarState);
    }

    // Send current breakout room layout to new joiner.
    const breakoutRoomsArr = Array.from(room.breakoutRooms.entries()).map(([id, socketIds], i) => ({
      id,
      name: `Breakout Room ${i + 1}`,
      participantSocketIds: socketIds,
    }));
    if (breakoutRoomsArr.length > 0) {
      const brUpdate: BreakoutUpdatePayload = { roomId: payload.roomId, breakoutRooms: breakoutRoomsArr };
      socket.emit("breakout-update", brUpdate);
      const myBreakout = room.breakoutAssignments.get(socket.id);
      if (myBreakout) {
        const myRoom = room.breakoutRooms.get(myBreakout);
        const myRoomName = myRoom ? `Breakout Room ${Array.from(room.breakoutRooms.keys()).indexOf(myBreakout) + 1}` : "Breakout";
        const brAssigned: BreakoutAssignedPayload = { roomId: payload.roomId, breakoutRoomId: myBreakout, breakoutRoomName: myRoomName };
        socket.emit("breakout-assigned", brAssigned);
      }
    }
  });

  socket.on("admit-participant", (payload: AdmitParticipantPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      return;
    }

    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) {
      return;
    }

    const waiter = room.waitingRoom.get(payload.socketId);
    if (!waiter) {
      return;
    }

    room.waitingRoom.delete(payload.socketId);
    room.admittedSocketIds.add(payload.socketId);

    const waitingList = Array.from(room.waitingRoom.values());
    const updatePayload: WaitingRoomUpdatePayload = {
      roomId: payload.roomId,
      waiting: waitingList,
    };
    io.to(payload.roomId).emit("waiting-room-update", updatePayload);

    const decision: AdmissionDecisionPayload = { admitted: true };
    io.to(payload.socketId).emit("admission-decision", decision);
    console.log(`[admit] room=${payload.roomId} admitted socketId=${payload.socketId} by host=${socket.id} remainingWaiting=${waitingList.length}`);
  });

  socket.on("reject-participant", (payload: RejectParticipantPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      return;
    }

    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) {
      return;
    }

    room.waitingRoom.delete(payload.socketId);

    const waitingList = Array.from(room.waitingRoom.values());
    const updatePayload: WaitingRoomUpdatePayload = {
      roomId: payload.roomId,
      waiting: waitingList,
    };
    io.to(payload.roomId).emit("waiting-room-update", updatePayload);

    const decision: AdmissionDecisionPayload = { admitted: false };
    io.to(payload.socketId).emit("admission-decision", decision);
    console.log(`[reject] room=${payload.roomId} rejected socketId=${payload.socketId} by host=${socket.id}`);
  });

  socket.on("host-security-action", async (payload: HostSecurityActionPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      return;
    }

    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) {
      return;
    }

    const meeting = await resolveMeetingByIdOrRoomId(payload.roomId);
    if (!meeting) {
      return;
    }

    if (payload.action === "allow") {
      const targetSocketId = payload.targetSocketId?.trim();
      if (!targetSocketId) {
        return;
      }

      const waiter = room.waitingRoom.get(targetSocketId);
      if (!waiter) {
        return;
      }

      room.waitingRoom.delete(targetSocketId);
      room.admittedSocketIds.add(targetSocketId);

      const waitingList = Array.from(room.waitingRoom.values());
      const updatePayload: WaitingRoomUpdatePayload = {
        roomId: payload.roomId,
        waiting: waitingList,
      };
      io.to(payload.roomId).emit("waiting-room-update", updatePayload);

      const decision: AdmissionDecisionPayload = { admitted: true };
      io.to(targetSocketId).emit("admission-decision", decision);

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        eventType: "participant_allowed",
        severity: "info",
        actorUserId: auth.userId,
        participantDisplayName: waiter.username,
        metadata: {
          socketId: targetSocketId,
          reason: payload.reason || "Allowed by host",
          source: "security_alert",
        },
      });

      return;
    }

    if (payload.action === "remove") {
      const targetSocketId = payload.targetSocketId?.trim();
      if (!targetSocketId || !room.peers.has(targetSocketId)) {
        return;
      }

      io.to(targetSocketId).emit("removed-by-host", {
        roomId: payload.roomId,
        reason: payload.reason || "Removed by host",
      });

      const targetPeer = room.peers.get(targetSocketId);
      closePeerResources(targetPeer!);
      room.peers.delete(targetSocketId);
      io.to(payload.roomId).emit("user-left", { socketId: targetSocketId });

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        eventType: "participant_removed",
        severity: "warning",
        actorUserId: auth.userId,
        participantDisplayName: targetPeer?.participant.username,
        deviceFingerprint: targetPeer?.deviceFingerprint || null,
        ipAddress: targetPeer?.ipAddress || null,
        metadata: {
          socketId: targetSocketId,
          reason: payload.reason || "Removed by host",
        },
      });
      return;
    }

    if (payload.action === "block_device") {
      const fingerprint = payload.targetDeviceFingerprint?.trim();
      if (!fingerprint) {
        return;
      }

      await createSecurityBlock({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        blockType: "device",
        blockValue: fingerprint,
        reason: payload.reason || "Blocked by host",
        actorUserId: auth.userId,
      });

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        eventType: "device_blocked",
        severity: "warning",
        actorUserId: auth.userId,
        deviceFingerprint: fingerprint,
        metadata: { reason: payload.reason || "Blocked by host" },
      });
      return;
    }

    if (payload.action === "block_ip") {
      const ipAddress = payload.targetIpAddress?.trim();
      if (!ipAddress) {
        return;
      }

      await createSecurityBlock({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        blockType: "ip",
        blockValue: ipAddress,
        reason: payload.reason || "Blocked by host",
        actorUserId: auth.userId,
      });

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        eventType: "ip_blocked",
        severity: "warning",
        actorUserId: auth.userId,
        ipAddress,
        metadata: { reason: payload.reason || "Blocked by host" },
      });
      return;
    }

    if (payload.action === "lock" || payload.action === "unlock") {
      const locked = payload.action === "lock";
      await setMeetingLock({
        meetingId: meeting.meetingId,
        locked,
        actorUserId: auth.userId,
      });

      await createSecurityEvent({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.meetingId,
        eventType: locked ? "meeting_locked" : "meeting_unlocked",
        severity: "info",
        actorUserId: auth.userId,
        metadata: { roomId: payload.roomId },
      });

      io.to(payload.roomId).emit("meeting-lock-updated", {
        roomId: payload.roomId,
        locked,
      });
    }
  });

  socket.on("raise-hand", (payload: RaiseHandPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) {
      return;
    }

    room.raisedHands.add(socket.id);

    const update: HandRaisedUpdatePayload = {
      roomId: payload.roomId,
      raisedHands: Array.from(room.raisedHands),
    };
    io.to(payload.roomId).emit("hand-raised-update", update);
  });

  socket.on("lower-hand", (payload: LowerHandPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      return;
    }

    const auth = getSocketAuth(socket);
    if (!auth) {
      return;
    }

    // Only the host can lower someone else's hand; anyone can lower their own.
    if (payload.socketId !== socket.id && auth.role !== "host") {
      return;
    }

    room.raisedHands.delete(payload.socketId);

    const update: HandRaisedUpdatePayload = {
      roomId: payload.roomId,
      raisedHands: Array.from(room.raisedHands),
    };
    io.to(payload.roomId).emit("hand-raised-update", update);
  });

  socket.on("send-reaction", (payload: SendReactionPayload) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    if (!room || !peer) {
      return;
    }

    const event: ReactionEventPayload = {
      roomId: payload.roomId,
      emoji: payload.emoji,
      senderSocketId: socket.id,
      senderName: peer.participant.username,
      createdAt: Date.now(),
    };

    io.to(payload.roomId).emit("reaction", event);
  });

  socket.on("e2ee-key-offer", (payload: E2eeKeyOfferPayload, callback?: (response: { ok?: boolean; error?: string }) => void) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    if (!room || !peer) {
      callback?.({ error: "Room or peer not found" });
      return;
    }

    if (!room.e2ee.enabled) {
      callback?.({ error: "E2EE phase-1 is disabled" });
      return;
    }

    const isHost = room.hostSocketId === socket.id;
    if (!isHost) {
      callback?.({ error: "Only host can publish E2EE keys" });
      return;
    }

    if (!payload.keyMaterialB64?.trim() || !payload.keyFingerprint?.trim()) {
      callback?.({ error: "Invalid key material" });
      return;
    }

    if (payload.algorithm !== "xor-v1") {
      callback?.({ error: "Unsupported E2EE algorithm" });
      return;
    }

    if (!Number.isFinite(payload.keyEpoch) || payload.keyEpoch <= room.e2ee.keyEpoch) {
      callback?.({ error: "keyEpoch must be greater than current epoch" });
      return;
    }

    room.e2ee.keyEpoch = payload.keyEpoch;
    room.e2ee.keyFingerprint = payload.keyFingerprint;
    room.e2ee.keyOwnerSocketId = socket.id;
    room.e2ee.lastAckedSocketId = null;
    room.e2ee.ackedSocketIds.clear();

    io.to(payload.roomId).emit("e2ee-key-update", payload);
    callback?.({ ok: true });
  });

  socket.on("e2ee-key-ack", (payload: E2eeKeyAckPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.e2ee.enabled) {
      return;
    }

    if (payload.socketId !== socket.id) {
      return;
    }

    if (payload.keyEpoch !== room.e2ee.keyEpoch) {
      return;
    }

    room.e2ee.ackedSocketIds.add(socket.id);
    room.e2ee.lastAckedSocketId = socket.id;

    const hostPayload: E2eeKeyAckPayload = {
      roomId: payload.roomId,
      keyEpoch: payload.keyEpoch,
      socketId: payload.socketId,
      ...getE2eeAckState(room),
    };

    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit("e2ee-key-ack", hostPayload);
    }
  });

  socket.on(
    "create-webrtc-transport",
    async (payload: CreateWebRtcTransportPayload, callback) => {
      const room = rooms.get(payload.roomId);
      const peer = room?.peers.get(socket.id);
      const direction = payload.direction;

      if (!room || !peer) {
        callback({ error: "Room or peer not found" });
        return;
      }

      if (direction !== "send" && direction !== "recv") {
        callback({ error: "Invalid transport direction" });
        return;
      }

      const { transport, params } = await createWebRtcTransport(
        room.router,
        direction,
        socket.id,
      );
      peer.transports.set(transport.id, transport);

      callback({ params, direction });
    },
  );

  socket.on(
    "connect-webrtc-transport",
    async (payload: ConnectWebRtcTransportPayload, callback) => {
      const room = rooms.get(payload.roomId);
      const peer = room?.peers.get(socket.id);
      const transport = peer?.transports.get(payload.transportId);

      if (!transport) {
        callback({ error: "Transport not found" });
        return;
      }

      // DTLS parameters are required to complete ICE/DTLS handshake for this transport.
      await transport.connect({ dtlsParameters: payload.dtlsParameters as never });
      callback({ connected: true });
    },
  );

  socket.on("produce", async (payload: ProducePayload, callback) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    const transport = peer?.transports.get(payload.transportId);

    if (!transport || !peer) {
      callback({ error: "Transport or peer not found" });
      return;
    }

    // Webinar mode: only host and registered presenters may produce media.
    if (room?.webinarMode) {
      const isHost = room.hostSocketId === socket.id;
      const isPresenter = room.presenterSocketIds.has(socket.id);
      if (!isHost && !isPresenter) {
        callback({ error: "Attendees cannot produce media in webinar mode" });
        return;
      }
    }

    const direction = transport.appData?.direction as TransportDirection | undefined;
    if (direction !== "send") {
      callback({ error: "Producer must use a send transport" });
      return;
    }

    if (payload.kind !== "audio" && payload.kind !== "video") {
      callback({ error: "Unsupported producer kind" });
      return;
    }

    const existingProducerId = peer.producersByKind.get(payload.kind);
    if (existingProducerId) {
      const existingProducer = peer.producers.get(existingProducerId);
      existingProducer?.close();
      peer.producers.delete(existingProducerId);
      peer.producersByKind.delete(payload.kind);
    }

    const producer = await transport.produce({
      kind: payload.kind,
      rtpParameters: payload.rtpParameters as never,
      appData: {
        ...(payload.appData || {}),
        mediaTag: payload.kind,
        socketId: socket.id,
      },
    });

    peer.producers.set(producer.id, producer);
    peer.producersByKind.set(payload.kind, producer.id);

    if (payload.kind === "audio") {
      const roomObserver = room?.audioLevelObserver;
      if (roomObserver) {
        await roomObserver.addProducer({ producerId: producer.id });
      }

      if (room) {
        await attachParticipantTranscription(payload.roomId, room, socket.id, producer);
      }
    }

    producer.on("transportclose", () => {
      peer.producers.delete(producer.id);
      if (peer.producersByKind.get(payload.kind) === producer.id) {
        peer.producersByKind.delete(payload.kind);
      }
    });

    // Notify all other participants in the room so they can create matching consumers.
    socket.to(payload.roomId).emit("new-producer", {
      producerId: producer.id,
      socketId: socket.id,
      kind: payload.kind,
    });

    callback({ producerId: producer.id });
  });

  socket.on("consume", async (payload: ConsumePayload, callback) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    const transport = peer?.transports.get(payload.transportId);

    if (!room || !peer || !transport) {
      callback({ error: "Room, peer, or transport missing" });
      return;
    }

    const direction = transport.appData?.direction as TransportDirection | undefined;
    if (direction !== "recv") {
      callback({ error: "Consumer must use a recv transport" });
      return;
    }

    const existingConsumerId = peer.consumersByProducerId.get(payload.producerId);
    if (existingConsumerId) {
      const existingConsumer = peer.consumers.get(existingConsumerId);
      if (existingConsumer) {
        callback({
          params: {
            id: existingConsumer.id,
            producerId: payload.producerId,
            kind: existingConsumer.kind,
            rtpParameters: existingConsumer.rtpParameters,
          },
        });
        return;
      }

      peer.consumersByProducerId.delete(payload.producerId);
    }

    if (!room.router.canConsume({ producerId: payload.producerId, rtpCapabilities: payload.rtpCapabilities as never })) {
      callback({ error: "Cannot consume this producer" });
      return;
    }

    const consumer = await transport.consume({
      producerId: payload.producerId,
      rtpCapabilities: payload.rtpCapabilities as never,
      paused: true,
    });

    if (consumer.kind === "video") {
      await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
    }

    peer.consumers.set(consumer.id, consumer);
    peer.consumersByProducerId.set(payload.producerId, consumer.id);

    consumer.on("score", (score) => {
      void applyAdaptiveLayers(consumer, score);
    });

    consumer.on("transportclose", () => {
      peer.consumers.delete(consumer.id);
      if (peer.consumersByProducerId.get(payload.producerId) === consumer.id) {
        peer.consumersByProducerId.delete(payload.producerId);
      }
    });

    consumer.on("producerclose", () => {
      peer.consumers.delete(consumer.id);
      if (peer.consumersByProducerId.get(payload.producerId) === consumer.id) {
        peer.consumersByProducerId.delete(payload.producerId);
      }
      socket.emit("producer-closed", { producerId: payload.producerId, consumerId: consumer.id });
      consumer.close();
    });

    callback({
      params: {
        id: consumer.id,
        producerId: payload.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      },
    });
  });

  socket.on("resume-consumer", async (payload: ResumeConsumerPayload, callback) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    const consumer = peer?.consumers.get(payload.consumerId);

    if (!consumer) {
      callback({ error: "Consumer not found" });
      return;
    }

    await consumer.resume();
    callback({ resumed: true });
  });

  socket.on("presence-update", (payload: PresenceUpdatePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      return;
    }

    const matchedPeer = Array.from(room.peers.values()).find(
      (peer) => peer.participant.userId === payload.userId,
    );

    const participant = matchedPeer?.participant;
    if (!participant) {
      return;
    }

    const next: ServerParticipant = {
      ...participant,
      isMuted: payload.isMuted ?? participant.isMuted,
      isCameraOff: payload.isCameraOff ?? participant.isCameraOff,
      isScreenSharing: payload.isScreenSharing ?? participant.isScreenSharing,
    };

    matchedPeer!.participant = next;
    io.to(payload.roomId).emit("presence-updated", next);
  });

  socket.on("chat-message", (payload: ChatPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) {
      console.warn(`[chat-message] DROP room=${payload.roomId} sender=${socket.id} — peer not in room (peers=${room?.peers.size ?? 0})`);
      return;
    }

    if (!room.chatHistory.some((item) => item.id === payload.message.id)) {
      room.chatHistory.push(payload.message);
    }

    const recipientCount = room.peers.size - 1;
    console.log(`[chat-message] room=${payload.roomId} from=${socket.id} msgId=${payload.message.id} recipients=${recipientCount} historyLen=${room.chatHistory.length}`);
    socket.to(payload.roomId).emit("chat-message", payload);
  });

  socket.on("chat-typing", (payload: ChatTypingPayload) => {
    socket.to(payload.roomId).emit("chat-typing", payload);
  });

  socket.on("chat-message-reaction", (payload: ChatMessageReactionPayload) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    if (!room || !peer) {
      return;
    }

    if (payload.reaction.senderId !== peer.participant.userId) {
      return;
    }

    const index = room.chatHistory.findIndex((item) => item.id === payload.messageId);
    if (index < 0) {
      return;
    }

    const target = room.chatHistory[index];
    if (target.isDeleted) {
      return;
    }

    const currentReactions = target.reactions ?? [];
    const alreadyExists = currentReactions.some(
      (item) => item.senderId === payload.reaction.senderId && item.emoji === payload.reaction.emoji,
    );

    const nextReactions = payload.action === "remove"
      ? currentReactions.filter(
          (item) => !(item.senderId === payload.reaction.senderId && item.emoji === payload.reaction.emoji),
        )
      : alreadyExists
        ? currentReactions
        : [...currentReactions, payload.reaction];

    room.chatHistory[index] = {
      ...target,
      reactions: nextReactions,
    };

    socket.to(payload.roomId).emit("chat-message-reaction", payload);
  });

  socket.on("chat-message-edit", (payload: ChatMessageEditPayload) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    if (!room || !peer) {
      return;
    }

    const index = room.chatHistory.findIndex((item) => item.id === payload.messageId);
    if (index < 0) {
      return;
    }

    const existing = room.chatHistory[index];
    if (existing.senderId !== peer.participant.userId || existing.senderId !== payload.senderId || existing.isDeleted) {
      return;
    }

    room.chatHistory[index] = {
      ...existing,
      message: payload.message,
      editedAt: payload.editedAt,
    };

    io.to(payload.roomId).emit("chat-message-edit", payload);
  });

  socket.on("chat-message-delete", (payload: ChatMessageDeletePayload) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    if (!room || !peer) {
      return;
    }

    const index = room.chatHistory.findIndex((item) => item.id === payload.messageId);
    if (index < 0) {
      return;
    }

    const existing = room.chatHistory[index];
    if (existing.senderId !== peer.participant.userId || existing.senderId !== payload.senderId || existing.isDeleted) {
      return;
    }

    room.chatHistory[index] = {
      ...existing,
      message: "[deleted]",
      isDeleted: true,
      deletedAt: payload.deletedAt,
      reactions: [],
    };

    io.to(payload.roomId).emit("chat-message-delete", payload);
  });

  socket.on("chat-message-pin", (payload: ChatMessagePinPayload) => {
    const room = rooms.get(payload.roomId);
    const peer = room?.peers.get(socket.id);
    if (!room || !peer) {
      return;
    }

    const index = room.chatHistory.findIndex((item) => item.id === payload.messageId);
    if (index < 0) {
      return;
    }

    room.chatHistory[index] = {
      ...room.chatHistory[index],
      isPinned: payload.pinnedAt !== null,
      pinnedAt: payload.pinnedAt,
    };

    io.to(payload.roomId).emit("chat-message-pin", payload);
  });

  socket.on("chat-message-seen", (payload: ChatMessageSeenPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room?.peers.has(socket.id)) return;
    // Update server-side history so late joiners get current seenBy state
    for (const msg of room.chatHistory) {
      if (msg.sentAt <= payload.sentAt && !msg.isDeleted) {
        const existing = msg.seenBy ?? [];
        if (!existing.some((s: { userId: string }) => s.userId === payload.userId)) {
          msg.seenBy = [...existing, { userId: payload.userId, name: payload.name }];
        }
      }
    }
    socket.to(payload.roomId).emit("chat-message-seen", payload);
  });

  socket.on("file-shared", (payload: FileSharedPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) {
      return;
    }

    if (!room.fileShareHistory.some((item) => item.id === payload.file.id)) {
      room.fileShareHistory.push(payload.file);
    }

    socket.to(payload.roomId).emit("file-shared", payload);
  });

  socket.on("leave-room", ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    if (room.recordingSession && room.recordingSession.requesterSocketId === socket.id) {
      closeRecordingSession(room.recordingSession);
      room.recordingSession = null;
      io.to(roomId).emit("recording-stopped", { roomId });
    }

    const peer = room.peers.get(socket.id);
    if (peer) {
      closePeerResources(peer);
    }

    const participantTranscription = room.transcriptionSession?.participantSessions.get(socket.id);
    if (participantTranscription) {
      closeParticipantTranscriptionSession(participantTranscription);
      room.transcriptionSession?.participantSessions.delete(socket.id);
    }

    room.peers.delete(socket.id);
    room.whiteboardCursors.delete(socket.id);
    void closeJoinSessionBySocketId(socket.id);
    socket.leave(roomId);
    socket.to(roomId).emit("user-left", { socketId: socket.id });
    socket.to(roomId).emit("whiteboard-cursor-remove", { roomId, socketId: socket.id });

    if (room.peers.size === 0) {
      rooms.delete(roomId);
    }
  });

  // ── Breakout rooms ──────────────────────────────────────────────────────
  socket.on("create-breakout-rooms", (payload: CreateBreakoutRoomsPayload, callback: (res: { error?: string; breakoutRooms?: BreakoutRoom[] }) => void) => {
    const room = rooms.get(payload.roomId);
    if (!room) { callback({ error: "Room not found" }); return; }
    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) {
      callback({ error: "Only the host may create breakout rooms" }); return;
    }
    const count = Math.max(1, Math.min(50, payload.count));
    room.breakoutRooms.clear();
    room.breakoutAssignments.clear();
    const created: BreakoutRoom[] = [];
    for (let i = 1; i <= count; i++) {
      const id = `${payload.roomId}-br-${i}`;
      room.breakoutRooms.set(id, []);
      created.push({ id, name: `Breakout Room ${i}`, participantSocketIds: [] });
    }
    const update: BreakoutUpdatePayload = { roomId: payload.roomId, breakoutRooms: created };
    io.to(payload.roomId).emit("breakout-update", update);
    callback({ breakoutRooms: created });
  });

  socket.on("assign-to-breakout", (payload: AssignBreakoutPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) return;

    // Update assignments map
    for (const [targetSocketId, breakoutRoomId] of Object.entries(payload.assignments)) {
      // Remove previous assignment
      const prev = room.breakoutAssignments.get(targetSocketId);
      if (prev) {
        const prevList = room.breakoutRooms.get(prev) ?? [];
        room.breakoutRooms.set(prev, prevList.filter((id) => id !== targetSocketId));
      }
      room.breakoutAssignments.set(targetSocketId, breakoutRoomId);
      const list = room.breakoutRooms.get(breakoutRoomId) ?? [];
      if (!list.includes(targetSocketId)) list.push(targetSocketId);
      room.breakoutRooms.set(breakoutRoomId, list);

      const roomKeys = Array.from(room.breakoutRooms.keys());
      const idx = roomKeys.indexOf(breakoutRoomId);
      const brAssigned: BreakoutAssignedPayload = {
        roomId: payload.roomId,
        breakoutRoomId,
        breakoutRoomName: `Breakout Room ${idx + 1}`,
      };
      io.to(targetSocketId).emit("breakout-assigned", brAssigned);
    }

    // Broadcast updated layout
    const breakoutRoomsArr: BreakoutRoom[] = Array.from(room.breakoutRooms.entries()).map(([id, socketIds], i) => ({
      id,
      name: `Breakout Room ${i + 1}`,
      participantSocketIds: socketIds,
    }));
    io.to(payload.roomId).emit("breakout-update", { roomId: payload.roomId, breakoutRooms: breakoutRoomsArr });
  });

  socket.on("close-breakout-rooms", (payload: CloseBreakoutRoomsPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) return;
    room.breakoutRooms.clear();
    room.breakoutAssignments.clear();
    const closed: BreakoutClosedPayload = { mainRoomId: payload.roomId };
    io.to(payload.roomId).emit("breakout-closed", closed);
    io.to(payload.roomId).emit("breakout-update", { roomId: payload.roomId, breakoutRooms: [] });
  });

  // ── Whiteboard ──────────────────────────────────────────────────────────
  socket.on("whiteboard-element-add", (payload: WhiteboardElementAddPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) return;
    // Keep history bounded for long sessions.
    if (room.whiteboardElements.length >= 3000) room.whiteboardElements.shift();
    room.whiteboardElements.push(payload.element);
    socket.to(payload.roomId).emit("whiteboard-element-added", payload);
  });

  socket.on("whiteboard-element-update", (payload: WhiteboardElementUpdatePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) return;
    const auth = getSocketAuth(socket);
    const isHost = auth?.role === "host" && room.hostSocketId === socket.id;
    const idx = room.whiteboardElements.findIndex((item) => item.id === payload.element.id);
    if (idx < 0) return;
    const existing = room.whiteboardElements[idx];
    if (!isHost && existing.socketId !== socket.id) return;
    room.whiteboardElements[idx] = payload.element;
    io.to(payload.roomId).emit("whiteboard-element-updated", payload);
  });

  socket.on("whiteboard-element-delete", (payload: WhiteboardElementDeletePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) return;
    const auth = getSocketAuth(socket);
    const isHost = auth?.role === "host" && room.hostSocketId === socket.id;
    const existing = room.whiteboardElements.find((item) => item.id === payload.elementId);
    if (!existing) return;
    if (!isHost && existing.socketId !== socket.id) return;
    room.whiteboardElements = room.whiteboardElements.filter((item) => item.id !== payload.elementId);
    io.to(payload.roomId).emit("whiteboard-element-deleted", payload);
  });

  socket.on("whiteboard-clear", (payload: WhiteboardClearPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    const isHost = auth?.role === "host" && room.hostSocketId === socket.id;
    if (!isHost) return;
    room.whiteboardElements = [];
    io.to(payload.roomId).emit("whiteboard-clear", payload);
  });

  socket.on("whiteboard-elements-replace", (payload: WhiteboardElementsReplacePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    const isHost = auth?.role === "host" && room.hostSocketId === socket.id;
    if (!isHost) return;
    room.whiteboardElements = payload.elements.slice(0, 3000);
    const state: WhiteboardElementsStatePayload = {
      roomId: payload.roomId,
      elements: room.whiteboardElements,
    };
    io.to(payload.roomId).emit("whiteboard-elements-state", state);
  });

  socket.on("whiteboard-cursor-move", (payload: WhiteboardCursorMovePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) return;
    room.whiteboardCursors.set(socket.id, payload.cursor);
    socket.to(payload.roomId).emit("whiteboard-cursor-move", payload);
  });

  // ── Webinar mode ────────────────────────────────────────────────────────
  socket.on("set-webinar-mode", (payload: SetWebinarModePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) return;
    room.webinarMode = payload.enabled;
    if (!payload.enabled) room.presenterSocketIds.clear();
    const state: WebinarStatePayload = {
      roomId: payload.roomId,
      webinarMode: payload.enabled,
      presenterSocketIds: Array.from(room.presenterSocketIds),
    };
    io.to(payload.roomId).emit("webinar-state", state);
  });

  socket.on("promote-to-presenter", (payload: PromoteToPresenterPayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) return;
    room.presenterSocketIds.add(payload.targetSocketId);
    const state: WebinarStatePayload = {
      roomId: payload.roomId,
      webinarMode: room.webinarMode,
      presenterSocketIds: Array.from(room.presenterSocketIds),
    };
    io.to(payload.roomId).emit("webinar-state", state);
  });

  socket.on("demote-to-attendee", (payload: DemoteToAttendeePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const auth = getSocketAuth(socket);
    if (!auth || auth.role !== "host" || room.hostSocketId !== socket.id) return;
    room.presenterSocketIds.delete(payload.targetSocketId);
    const state: WebinarStatePayload = {
      roomId: payload.roomId,
      webinarMode: room.webinarMode,
      presenterSocketIds: Array.from(room.presenterSocketIds),
    };
    io.to(payload.roomId).emit("webinar-state", state);
  });

  // ── Emotion detection relay ────────────────────────────────────────────────
  // The server simply relays emotion updates from one client to the rest of the
  // room — no server-side processing required.
  socket.on("emotion-update", (payload: EmotionUpdatePayload) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.peers.has(socket.id)) return;
    const relayed: EmotionUpdatePayload = { ...payload, socketId: socket.id };
    socket.to(payload.roomId).emit("emotion-update", relayed);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[signaling] socket disconnected  id=${socket.id}  reason=${reason}`);
    void closeJoinSessionBySocketId(socket.id);
    for (const [roomId, room] of rooms.entries()) {
      // Clean up from waiting room if the socket disconnected while waiting.
      if (room.waitingRoom.has(socket.id)) {
        room.waitingRoom.delete(socket.id);
        const waitingList = Array.from(room.waitingRoom.values());
        const updatePayload: WaitingRoomUpdatePayload = { roomId, waiting: waitingList };
        io.to(roomId).emit("waiting-room-update", updatePayload);
      }
      room.admittedSocketIds.delete(socket.id);
      room.whiteboardCursors.delete(socket.id);
      io.to(roomId).emit("whiteboard-cursor-remove", { roomId, socketId: socket.id });

      // Clean up raised hand on disconnect.
      if (room.raisedHands.has(socket.id)) {
        room.raisedHands.delete(socket.id);
        const update: HandRaisedUpdatePayload = {
          roomId,
          raisedHands: Array.from(room.raisedHands),
        };
        io.to(roomId).emit("hand-raised-update", update);
      }

      const peer = room.peers.get(socket.id);
      if (!peer) {
        continue;
      }

      closePeerResources(peer);
      room.peers.delete(socket.id);
      socket.to(roomId).emit("user-left", { socketId: socket.id });

      const participantTranscription = room.transcriptionSession?.participantSessions.get(socket.id);
      if (participantTranscription) {
        closeParticipantTranscriptionSession(participantTranscription);
        room.transcriptionSession?.participantSessions.delete(socket.id);
      }

      if (
        room.recordingSession &&
        (room.recordingSession.requesterSocketId === socket.id ||
          room.recordingSession.targetSocketId === socket.id)
      ) {
        closeRecordingSession(room.recordingSession);
        room.recordingSession = null;
        io.to(roomId).emit("recording-stopped", { roomId });
      }

      if (room.peers.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  socket.on("start-recording", async (payload: StartRecordingPayload, callback) => {
        if (!isFfmpegAvailable()) {
          callback({ error: "FFmpeg is not installed or not found in PATH. Set FFMPEG_PATH or install ffmpeg." });
          return;
        }

    const room = rooms.get(payload.roomId);
    if (!room) {
      callback({ error: "Room not found" });
      return;
    }

    const limits = await getWorkspacePlanLimitsByRoomId(payload.roomId);
    const recordingOverrideEnabled =
      process.env.ALLOW_RECORDING_ON_FREE === "true" || process.env.NODE_ENV !== "production";
    if (!limits?.recordingEnabled && !recordingOverrideEnabled) {
      callback({ error: "Recording is not enabled on the current subscription plan" });
      return;
    }

    if (room.recordingSession) {
      callback({ error: "Recording is already active for this room" });
      return;
    }

    const targetSocketId = payload.targetSocketId || socket.id;
    const targetPeer = room.peers.get(targetSocketId);
    if (!targetPeer) {
      callback({ error: "Target participant not found" });
      return;
    }

    const audioProducerId = targetPeer.producersByKind.get("audio");
    const videoProducerId = targetPeer.producersByKind.get("video");

    if (!audioProducerId || !videoProducerId) {
      callback({ error: "Target participant must publish both audio and video" });
      return;
    }

    const audioProducer = targetPeer.producers.get(audioProducerId);
    const videoProducer = targetPeer.producers.get(videoProducerId);

    if (!audioProducer || !videoProducer) {
      callback({ error: "Could not resolve audio/video producers" });
      return;
    }

    const [audioPort, audioRtcpPort, videoPort, videoRtcpPort] = await Promise.all([
      getFreeUdpPort(),
      getFreeUdpPort(),
      getFreeUdpPort(),
      getFreeUdpPort(),
    ]);

    const audioTransport = await room.router.createPlainTransport({
      listenIp: "127.0.0.1",
      comedia: false,
      rtcpMux: false,
    });

    const videoTransport = await room.router.createPlainTransport({
      listenIp: "127.0.0.1",
      comedia: false,
      rtcpMux: false,
    });

    await audioTransport.connect({ ip: "127.0.0.1", port: audioPort, rtcpPort: audioRtcpPort });
    await videoTransport.connect({ ip: "127.0.0.1", port: videoPort, rtcpPort: videoRtcpPort });

    const audioConsumer = await audioTransport.consume({
      producerId: audioProducer.id,
      rtpCapabilities: room.router.rtpCapabilities,
      paused: true,
    });

    const videoConsumer = await videoTransport.consume({
      producerId: videoProducer.id,
      rtpCapabilities: room.router.rtpCapabilities,
      paused: true,
    });

    const recordingsDir = process.env.RECORDINGS_DIR || path.join(process.cwd(), "recordings");
    mkdirSync(recordingsDir, { recursive: true });

    const fileName = `meeting-${payload.roomId}-${Date.now()}${GPU_ENCODER.ext}`;
    const filePath = path.join(recordingsDir, fileName);

    const audioCodec = audioConsumer.rtpParameters.codecs[0];
    const videoCodec = videoConsumer.rtpParameters.codecs[0];

    if (!audioCodec || !videoCodec) {
      audioConsumer.close();
      videoConsumer.close();
      audioTransport.close();
      videoTransport.close();
      callback({ error: "Could not resolve recording codecs" });
      return;
    }

    const sdp = createRecordingSdp({
      audioPort,
      audioRtcpPort,
      audioCodecPayloadType: audioCodec.payloadType,
      audioCodecName: codecNameFromMimeType(audioCodec.mimeType),
      audioClockRate: audioCodec.clockRate,
      audioChannels: audioCodec.channels || 2,
      videoPort,
      videoRtcpPort,
      videoCodecPayloadType: videoCodec.payloadType,
      videoCodecName: codecNameFromMimeType(videoCodec.mimeType),
      videoClockRate: videoCodec.clockRate,
    });

    const ffmpegPath = resolveFfmpegPath();

    let recordingFailed = false;
    let callbackSent = false;
    const ffmpegErrors: string[] = [];

    const callbackOnce = (payload: Record<string, unknown>) => {
      if (callbackSent) {
        return;
      }

      callbackSent = true;
      callback(payload);
    };

    type RecordingPipelineMode = "copy" | "reencode";
    let fallbackAttempted = false;

    const watermarkEnabled = process.env.RECORDING_WATERMARK_ENABLED !== "false";
    const defaultWatermarkTemplate = "MeetFlow CONFIDENTIAL | room={roomId} | target={targetSocketId}";
    const watermarkTemplate =
      process.env.RECORDING_WATERMARK_TEXT ||
      defaultWatermarkTemplate;
    const watermarkText = escapeFfmpegDrawtext(
      watermarkTemplate
        .replaceAll("{roomId}", payload.roomId)
        .replaceAll("{targetSocketId}", targetSocketId),
    );

    const buildRecordingArgs = (mode: RecordingPipelineMode) => {
      const shared = [
        "-protocol_whitelist",
        "file,udp,rtp,pipe",
        "-fflags",
        "+genpts",
        "-use_wallclock_as_timestamps",
        "1",
        "-analyzeduration",
        "10M",
        "-probesize",
        "10M",
        "-f",
        "sdp",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0?",
        "-map",
        "0:v:0?",
        "-max_interleave_delta",
        "0",
      ];

      const copyOutput = [
        "-c:a",
        "copy",
        "-c:v",
        "copy",
      ];

      const isH264 = GPU_ENCODER.codec !== "libvpx";
      const gpuReencodeVideo: string[] = isH264
        ? ["-c:v", GPU_ENCODER.codec, "-preset", "fast", "-b:v", "1500k", "-maxrate", "1800k", "-bufsize", "3600k", "-pix_fmt", "yuv420p"]
        : ["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1500k", "-maxrate", "1800k", "-bufsize", "3600k", "-pix_fmt", "yuv420p"];

      const reencodeOutput = [
        "-c:a",
        isH264 ? "aac" : "libopus",
        "-b:a",
        "128k",
        ...gpuReencodeVideo,
      ];

      const watermarkFilter = [
        "-vf",
        `drawtext=text='${watermarkText}':fontcolor=white@0.35:fontsize=24:x=(w-text_w-28):y=(h-text_h-28):box=1:boxcolor=black@0.25:boxborderw=10`,
      ];

      const output = [
        "-f",
        GPU_ENCODER.container,
        "-y",
        filePath,
      ];

      return [
        ...shared,
        ...(mode === "copy" ? copyOutput : reencodeOutput),
        ...(mode === "reencode" && watermarkEnabled ? watermarkFilter : []),
        ...output,
      ];
    };

    const startRecordingFfmpeg = (mode: RecordingPipelineMode) => {
      const process = spawn(ffmpegPath, buildRecordingArgs(mode));

      process.on("error", (error) => {
        recordingFailed = true;
        console.error(`Recording ffmpeg process failed (${mode})`, error);

        const liveRoom = rooms.get(payload.roomId);
        if (!liveRoom) {
          return;
        }

        audioConsumer.close();
        videoConsumer.close();
        audioTransport.close();
        videoTransport.close();
        liveRoom.recordingSession = null;

        const message = `FFmpeg failed to start for recording (${mode})`;
        io.to(payload.roomId).emit("recording-error", {
          roomId: payload.roomId,
          error: message,
        });
        callbackOnce({ error: message });
      });

      process.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        if (!text.trim()) {
          return;
        }

        ffmpegErrors.push(`[${mode}] ${text.trim()}`);
        // Keep only the latest lines to avoid unbounded growth.
        if (ffmpegErrors.length > 40) {
          ffmpegErrors.splice(0, ffmpegErrors.length - 40);
        }
      });

      process.stdin.write(sdp);
      process.stdin.end();

      process.on("exit", (code, signal) => {
        const liveRoom = rooms.get(payload.roomId);
        const detail =
          ffmpegErrors.at(-1) ||
          `exit code ${String(code)}${signal ? ` (${signal})` : ""}`;

        if (!liveRoom?.recordingSession) {
          if (!callbackSent) {
            callbackOnce({ error: `Recording failed to start: ${detail}` });
          }
          return;
        }

        const shouldRetryWithReencode =
          mode === "copy" &&
          !fallbackAttempted &&
          code !== 0;

        if (shouldRetryWithReencode) {
          fallbackAttempted = true;

          const fallbackFfmpeg = startRecordingFfmpeg("reencode");
          liveRoom.recordingSession.ffmpeg = fallbackFfmpeg;
          return;
        }

        liveRoom.recordingSession = null;
        io.to(payload.roomId).emit("recording-error", {
          roomId: payload.roomId,
          error: `Recording stopped unexpectedly: ${detail}`,
        });
        io.to(payload.roomId).emit("recording-stopped", { roomId: payload.roomId, filePath });
      });

      return process;
    };

    const ffmpeg = startRecordingFfmpeg(watermarkEnabled ? "reencode" : "copy");

    if (recordingFailed) {
      return;
    }

    await audioConsumer.resume();
    await videoConsumer.resume();

    // Ensure recording gets an intra frame quickly; without this short sessions can end up empty.
    void videoConsumer.requestKeyFrame().catch(() => undefined);
    setTimeout(() => {
      void videoConsumer.requestKeyFrame().catch(() => undefined);
    }, 1000);

    if (recordingFailed) {
      return;
    }

    room.recordingSession = {
      ffmpeg,
      filePath,
      requesterSocketId: socket.id,
      targetSocketId,
      audioTransport,
      videoTransport,
      audioConsumer,
      videoConsumer,
    };

    io.to(payload.roomId).emit("recording-started", { roomId: payload.roomId, targetSocketId });
    callbackOnce({ started: true, filePath });
  });

  socket.on("stop-recording", (payload: StopRecordingPayload, callback) => {
    const room = rooms.get(payload.roomId);
    if (!room?.recordingSession) {
      callback({ error: "No active recording for room" });
      return;
    }

    const { recordingSession } = room;
    closeRecordingSession(recordingSession);
    room.recordingSession = null;

    io.to(payload.roomId).emit("recording-stopped", {
      roomId: payload.roomId,
      filePath: recordingSession.filePath,
    });

    callback({ stopped: true, filePath: recordingSession.filePath });
  });

  socket.on("start-transcription", async (payload: StartTranscriptionPayload, callback) => {
        if (!isFfmpegAvailable()) {
          callback({ error: "FFmpeg is not installed or not found in PATH. Set FFMPEG_PATH or install ffmpeg." });
          return;
        }

    const room = rooms.get(payload.roomId);
    if (!room) {
      callback({ error: "Room not found" });
      return;
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      callback({ error: "DEEPGRAM_API_KEY is missing" });
      return;
    }

    if (!room.transcriptionSession) {
      room.transcriptionSession = {
        startedBySocketId: socket.id,
        service: new DeepgramSpeechToTextService(apiKey),
        participantSessions: new Map(),
      };
    }

    const attachTasks: Promise<void>[] = [];
    for (const [participantSocketId, participantPeer] of room.peers.entries()) {
      const audioProducerId = participantPeer.producersByKind.get("audio");
      if (!audioProducerId) {
        continue;
      }

      const audioProducer = participantPeer.producers.get(audioProducerId);
      if (!audioProducer) {
        continue;
      }

      attachTasks.push(attachParticipantTranscription(payload.roomId, room, participantSocketId, audioProducer));
    }

    await Promise.all(attachTasks);
    io.to(payload.roomId).emit("transcription-started", { roomId: payload.roomId });
    callback({ started: true, transcriptHistory: room.transcriptHistory });
  });

  socket.on("stop-transcription", (payload: StopTranscriptionPayload, callback) => {
    const room = rooms.get(payload.roomId);
    if (!room?.transcriptionSession) {
      callback({ error: "No active transcription session" });
      return;
    }

    closeTranscriptionSession(room.transcriptionSession);
    room.transcriptionSession = null;
    io.to(payload.roomId).emit("transcription-stopped", { roomId: payload.roomId });
    callback({ stopped: true, transcriptHistory: room.transcriptHistory });
  });
});

const port = Number(process.env.SIGNALING_PORT || 4000);
initWorker()
  .then(async () => {
    await ensureMeetingSecuritySchema();
    server.listen(port, () => {
      console.log(`SFU signaling server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize mediasoup worker", error);
    process.exit(1);
  });
