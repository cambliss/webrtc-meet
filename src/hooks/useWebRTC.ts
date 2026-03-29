"use client";

import { Device } from "mediasoup-client";
import type {
  Consumer,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  Transport,
} from "mediasoup-client/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getIceServers } from "@/src/lib/iceServers";
import {
  attachPhase1E2eeToConsumer,
  attachPhase1E2eeToProducer,
  createPhase1KeyMaterial,
  getPhase1E2eeFlags,
  Phase1E2eeKeyStore,
  type E2eeRuntimeState,
} from "@/src/lib/e2ee";
import { NoiseSuppressionProcessor, isNoiseSuppressionSupported } from "@/src/lib/audioProcessing";
import {
  flushPendingRecordingUploads,
  getPendingRecordingUploadCount,
  isOfflineRecordingSyncSupported,
  queueRecordingUpload,
} from "@/src/lib/offlineRecordingSync";
import { useMeetingStore } from "@/src/store/meetingStore";
import { disconnectSocket, getSocket } from "@/src/services/socket";
import type { AppUser } from "@/src/types/auth";
import type { ChatMessage, ChatMessageReaction, MeetingFileShare, Participant, RemoteStream, TranscriptLine } from "@/src/types/meeting";
import type {
  AdmissionDecisionPayload,
  AdmitParticipantPayload,
  ChatMessageDeletePayload,
  ChatMessageEditPayload,
  ChatMessagePinPayload,
  ChatMessageReactionPayload,
  ChatMessageSeenPayload,
  ChatPayload,
  ChatTypingPayload,
  ConnectWebRtcTransportPayload,
  ConsumePayload,
  CreateWebRtcTransportPayload,
  FileSharedPayload,
  HandRaisedUpdatePayload,
  JoinRoomPayload,
  JoinRoomResponsePayload,
  LowerHandPayload,
  PresenceUpdatePayload,
  ProducePayload,
  RaiseHandPayload,
  ReactionEmoji,
  ReactionEventPayload,
  RejectParticipantPayload,
  ResumeConsumerPayload,
  HostSecurityActionPayload,
  SecurityAlertPayload,
  SendReactionPayload,
  StartTranscriptionPayload,
  StopTranscriptionPayload,
  WaitingRoomUpdatePayload,
  WebRtcTransportParams,
  // Breakout
  BreakoutRoom,
  BreakoutUpdatePayload,
  BreakoutAssignedPayload,
  BreakoutClosedPayload,
  CreateBreakoutRoomsPayload,
  AssignBreakoutPayload,
  CloseBreakoutRoomsPayload,
  // Whiteboard
  WhiteboardElement,
  WhiteboardElementAddPayload,
  WhiteboardElementsStatePayload,
  WhiteboardElementUpdatePayload,
  WhiteboardElementDeletePayload,
  WhiteboardClearPayload,
  WhiteboardElementsReplacePayload,
  WhiteboardCursorMovePayload,
  WhiteboardCursorStatePayload,
  WhiteboardCursorState,
  // Webinar
  WebinarStatePayload,
  SetWebinarModePayload,
  PromoteToPresenterPayload,
  DemoteToAttendeePayload,
  EmotionUpdatePayload,
  E2eeKeyAckPayload,
  E2eeKeyOfferPayload,
  E2eeRoomStatePayload,
  E2eeKeyUpdatePayload,
} from "@/src/types/socket";

type BodyPixModel = Awaited<ReturnType<(typeof import("@tensorflow-models/body-pix"))["load"]>>;

type UseWebRTCParams = {
  roomId: string;
  me: AppUser;
  inviteToken?: string | null;
};

type JoinRoomResponse = JoinRoomResponsePayload & {
  routerRtpCapabilities: RtpCapabilities;
};

type ConsumeResponse = {
  params: {
    id: string;
    producerId: string;
    kind: "audio" | "video";
    rtpParameters: RtpParameters;
  };
};

type FloatingReaction = {
  id: string;
  emoji: ReactionEmoji;
};

type LocalE2eeState = E2eeRuntimeState & {
  ackedParticipantCount: number;
  expectedParticipantCount: number;
  lastAckedSocketId: string | null;
};

export function useWebRTC({ roomId, me, inviteToken }: UseWebRTCParams) {
  const iceServers = useMemo(() => getIceServers(), []);

  const {
    setRoomContext,
    setParticipants,
    upsertParticipant,
    removeParticipant,
    addChatMessage,
    addChatMessageReaction,
    removeChatMessageReaction,
    editChatMessage,
    deleteChatMessage,
    pinChatMessage,
    unpinChatMessage,
    markChatMessageSeen,
    addFileShare,
    setFileShares,
    setTranscriptLines,
    addTranscriptLine,
    setMicEnabled,
    setCameraEnabled,
    setScreenSharing,
    setRecording,
    isMicEnabled,
    isCameraEnabled,
    isScreenSharing,
    isRecording,
    setWaitingRoom,
    setIsInWaitingRoom,
    waitingRoom,
    isInWaitingRoom,
    setRaisedHands,
    raisedHands,
  } = useMeetingStore();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [activeSpeakerSocketId, setActiveSpeakerSocketId] = useState<string | null>(null);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [isBackgroundBlurEnabled, setIsBackgroundBlurEnabled] = useState(false);
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(false);
  const [pendingRecordingUploads, setPendingRecordingUploads] = useState(0);
  const [isSyncingRecordings, setIsSyncingRecordings] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlertPayload[]>([]);
  const [isMeetingLocked, setIsMeetingLocked] = useState(false);
  const [selfAvatarPath, setSelfAvatarPath] = useState<string | null>(me.avatarPath ?? null);
  const [selfAvatarVersion, setSelfAvatarVersion] = useState<number | null>(me.avatarPath ? Date.now() : null);
  const [typingBySocketId, setTypingBySocketId] = useState<Record<string, string>>({});

  // Breakout rooms
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoom[]>([]);
  const [assignedBreakoutRoom, setAssignedBreakoutRoom] = useState<BreakoutAssignedPayload | null>(null);
  // Whiteboard
  const [whiteboardElements, setWhiteboardElements] = useState<WhiteboardElement[]>([]);
  const [whiteboardCursors, setWhiteboardCursors] = useState<WhiteboardCursorState[]>([]);
  // Webinar
  const [webinarMode, setWebinarMode] = useState(false);
  const [presenterSocketIds, setPresenterSocketIds] = useState<string[]>([]);
  // Low-bandwidth mode
  const [isLowBandwidthMode, setIsLowBandwidthMode] = useState(false);
  // Voice control
  const [isVoiceControlEnabled, setIsVoiceControlEnabled] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);
  // Auto camera framing
  const [isAutoFrameEnabled, setIsAutoFrameEnabled] = useState(false);
  // Emotion detection (socketId -> emoji or null)
  const [emotionBySocketId, setEmotionBySocketId] = useState<Record<string, string | null>>({});
  const e2eeFlags = useMemo(() => getPhase1E2eeFlags(), []);
  const [e2eeState, setE2eeState] = useState<LocalE2eeState>({
    keyEpoch: 0,
    keyFingerprint: null,
    keyMaterialB64: null,
    ackedParticipantCount: 0,
    expectedParticipantCount: 0,
    lastAckedSocketId: null,
  });

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const producersRef = useRef<Map<"audio" | "video", Producer>>(new Map());
  const consumersRef = useRef<Map<string, Consumer>>(new Map());
  const producerSocketRef = useRef<Map<string, string>>(new Map());
  const remoteMediaRef = useRef<Map<string, MediaStream>>(new Map());
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const selfSocketIdRef = useRef<string>("");
  const initializedRef = useRef(false);
  const reactionTimeoutsRef = useRef<number[]>([]);
  const baseCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blurVideoRef = useRef<HTMLVideoElement | null>(null);
  const blurRafRef = useRef<number | null>(null);
  const blurProcessedTrackRef = useRef<MediaStreamTrack | null>(null);
  const baseMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const noiseProcessedTrackRef = useRef<MediaStreamTrack | null>(null);
  const bodyPixModelRef = useRef<BodyPixModel | null>(null);
  const localRecordingStreamRef = useRef<MediaStream | null>(null);
  const localMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const localRecordingUploadPromiseRef = useRef<Promise<string | null> | null>(null);
  const noiseSuppressionProcessorRef = useRef<NoiseSuppressionProcessor | null>(null);
  const recordingSyncInFlightRef = useRef(false);
  const deviceFingerprintRef = useRef<string>("");
  const clientSessionIdRef = useRef<string>("");
  const joinInviteTokenRef = useRef<string | null>(inviteToken || null);
  const e2eeKeyStoreRef = useRef<Phase1E2eeKeyStore>(new Phase1E2eeKeyStore());
  const e2eeRotationTimerRef = useRef<number | null>(null);
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map());

  // ── New feature refs ───────────────────────────────────────────────────────
  // Voice control
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voiceRecognitionRef = useRef<any>(null);
  const voiceControlEnabledRef = useRef(false);
  // Auto camera framing pipeline
  const autoFrameVideoRef = useRef<HTMLVideoElement | null>(null);
  const autoFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoFrameRafRef = useRef<number | null>(null);
  const autoFrameProcessedTrackRef = useRef<MediaStreamTrack | null>(null);
  // Emotion detection
  const emotionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const emotionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emotionPrevDataRef = useRef<Uint8ClampedArray | null>(null);

  const getOrCreateClientSessionId = useCallback(() => {
    if (clientSessionIdRef.current) {
      return clientSessionIdRef.current;
    }

    const key = `cmbl-client-session-${roomId}`;
    const existing = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
    if (existing) {
      clientSessionIdRef.current = existing;
      return existing;
    }

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(key, generated);
    }
    clientSessionIdRef.current = generated;
    return generated;
  }, [roomId]);

  const refreshPendingRecordingUploads = useCallback(async () => {
    if (!isOfflineRecordingSyncSupported()) {
      setPendingRecordingUploads(0);
      return;
    }

    try {
      const count = await getPendingRecordingUploadCount();
      setPendingRecordingUploads(count);
    } catch {
      setPendingRecordingUploads(0);
    }
  }, []);

  const syncPendingRecordings = useCallback(async () => {
    if (recordingSyncInFlightRef.current || !isOfflineRecordingSyncSupported()) {
      return [] as Array<{ roomId: string; filePath: string }>;
    }

    recordingSyncInFlightRef.current = true;
    setIsSyncingRecordings(true);

    try {
      const flushed = await flushPendingRecordingUploads({
        onUploaded: ({ roomId: syncedRoomId, filePath }) => {
          if (syncedRoomId === roomId) {
            setRecordingPath(filePath);
            setRecordingError(null);
          }
        },
      });
      await refreshPendingRecordingUploads();
      return flushed;
    } finally {
      recordingSyncInFlightRef.current = false;
      setIsSyncingRecordings(false);
    }
  }, [refreshPendingRecordingUploads, roomId]);

  const buildDeviceFingerprint = useCallback(async () => {
    if (deviceFingerprintRef.current) {
      return deviceFingerprintRef.current;
    }

    try {
      const nav = navigator;
      const navWithDeviceMemory = nav as Navigator & { deviceMemory?: number };
      const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
      const raw = [
        nav.userAgent,
        nav.platform,
        nav.language,
        timezone,
        screenInfo,
        String(nav.hardwareConcurrency || ""),
        String(navWithDeviceMemory.deviceMemory || ""),
      ].join("|");

      const encoded = new TextEncoder().encode(raw);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      const hash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      deviceFingerprintRef.current = hash;
      return hash;
    } catch {
      const fallback = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      deviceFingerprintRef.current = fallback;
      return fallback;
    }
  }, []);

  const socketRequest = useCallback(
    <TResponse, TPayload>(event: string, payload: TPayload) => {
      const socket = getSocket();

      return new Promise<TResponse>((resolve, reject) => {
        socket.emit(event, payload, (response: { error?: string } & TResponse) => {
          if (response?.error) {
            reject(new Error(response.error));
            return;
          }

          resolve(response);
        });
      });
    },
    [],
  );

  const syncE2eeState = useCallback(() => {
    setE2eeState((prev) => ({
      ...prev,
      ...e2eeKeyStoreRef.current.getState(),
    }));
  }, []);

  const attachE2eeToExistingMedia = useCallback(() => {
    if (!e2eeFlags.enabled) {
      return;
    }

    for (const producer of producersRef.current.values()) {
      attachPhase1E2eeToProducer({
        producer,
        keyStore: e2eeKeyStoreRef.current,
        flags: e2eeFlags,
      });
    }

    for (const consumer of consumersRef.current.values()) {
      attachPhase1E2eeToConsumer({
        consumer,
        keyStore: e2eeKeyStoreRef.current,
        flags: e2eeFlags,
      });
    }
  }, [e2eeFlags]);

  const applyIncomingE2eeKey = useCallback(
    (payload: E2eeKeyUpdatePayload | E2eeRoomStatePayload) => {
      if (!e2eeFlags.enabled) {
        return;
      }

      if (!("keyMaterialB64" in payload)) {
        // Room-state payload does not include key material; keep only epoch/fingerprint metadata.
        setE2eeState((prev) => ({
          ...prev,
          keyEpoch: payload.keyEpoch,
          keyFingerprint: payload.keyFingerprint,
          ackedParticipantCount: payload.ackedParticipantCount ?? prev.ackedParticipantCount,
          expectedParticipantCount: payload.expectedParticipantCount ?? prev.expectedParticipantCount,
          lastAckedSocketId: payload.lastAckedSocketId ?? prev.lastAckedSocketId,
        }));
        return;
      }

      const accepted = e2eeKeyStoreRef.current.setKey({
        keyEpoch: payload.keyEpoch,
        keyMaterialB64: payload.keyMaterialB64,
        keyFingerprint: payload.keyFingerprint,
      });

      if (!accepted) {
        return;
      }

      syncE2eeState();
      attachE2eeToExistingMedia();

      const ack: E2eeKeyAckPayload = {
        roomId,
        keyEpoch: payload.keyEpoch,
        socketId: selfSocketIdRef.current,
      };
      getSocket().emit("e2ee-key-ack", ack);
    },
    [attachE2eeToExistingMedia, e2eeFlags.enabled, roomId, syncE2eeState],
  );

  const publishNewE2eeKey = useCallback(async () => {
    if (!e2eeFlags.enabled || me.role !== "host") {
      return;
    }

    const nextEpoch = Math.max(1, e2eeKeyStoreRef.current.getKeyEpoch() + 1);
    const generated = await createPhase1KeyMaterial();
    const payload: E2eeKeyOfferPayload = {
      roomId,
      keyEpoch: nextEpoch,
      keyMaterialB64: generated.keyMaterialB64,
      keyFingerprint: generated.fingerprint,
      algorithm: e2eeFlags.algorithm,
    };

    getSocket().emit("e2ee-key-offer", payload, (_response: { ok?: boolean; error?: string }) => {
      // Host also applies key locally in case event ordering delays the room broadcast.
      applyIncomingE2eeKey(payload);
    });
  }, [applyIncomingE2eeKey, e2eeFlags.algorithm, e2eeFlags.enabled, me.role, roomId]);

  const setupLocalMedia = useCallback(async () => {
    let stream: MediaStream | null = null;

    // Graceful fallback order avoids blocking room join when users deny one or both permissions.
    const constraints: MediaStreamConstraints[] = [
      { video: true, audio: true },
      { video: true, audio: false },
      { video: false, audio: true },
    ];

    for (const mediaConstraints of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        break;
      } catch {
        // Try the next fallback constraint.
      }
    }

    const resolvedStream = stream || new MediaStream();
    const videoTrack = resolvedStream.getVideoTracks()[0] || null;
    const audioTrack = resolvedStream.getAudioTracks()[0] || null;

    baseCameraTrackRef.current = videoTrack;
    baseMicTrackRef.current = audioTrack;
    localStreamRef.current = resolvedStream;
    setLocalStream(resolvedStream);
    setCameraEnabled(Boolean(videoTrack));
    setMicEnabled(Boolean(audioTrack));
    setIsReady(true);
    return resolvedStream;
  }, [setCameraEnabled, setMicEnabled]);

  const replaceLocalVideoTrack = useCallback(
    async (nextTrack: MediaStreamTrack, stopCurrent: boolean) => {
      const currentStream = localStreamRef.current;
      if (!currentStream) {
        return;
      }

      const currentVideoTrack = currentStream.getVideoTracks()[0];
      if (currentVideoTrack && currentVideoTrack.id !== nextTrack.id) {
        currentStream.removeTrack(currentVideoTrack);
        if (stopCurrent) {
          currentVideoTrack.stop();
        }
      }

      const hasTrack = currentStream
        .getVideoTracks()
        .some((track) => track.id === nextTrack.id);
      if (!hasTrack) {
        currentStream.addTrack(nextTrack);
      }

      const updated = new MediaStream(currentStream.getTracks());
      localStreamRef.current = updated;
      setLocalStream(updated);

      const videoProducer = producersRef.current.get("video");
      if (videoProducer) {
        await videoProducer.replaceTrack({ track: nextTrack });
      }
    },
    [],
  );

  const stopBlurPipeline = useCallback(() => {
    if (blurRafRef.current) {
      cancelAnimationFrame(blurRafRef.current);
      blurRafRef.current = null;
    }

    if (blurProcessedTrackRef.current) {
      blurProcessedTrackRef.current.stop();
      blurProcessedTrackRef.current = null;
    }

    if (blurVideoRef.current) {
      blurVideoRef.current.pause();
      blurVideoRef.current.srcObject = null;
      blurVideoRef.current = null;
    }

    blurCanvasRef.current = null;
  }, []);

  const enableBackgroundBlur = useCallback(async () => {
    if (isScreenSharing || isBackgroundBlurEnabled) {
      return;
    }

    const currentStream = localStreamRef.current;
    const sourceTrack = currentStream?.getVideoTracks()[0];
    if (!sourceTrack) {
      return;
    }

    baseCameraTrackRef.current = sourceTrack;

    const sourceStream = new MediaStream([sourceTrack]);
    const sourceVideo = document.createElement("video");
    sourceVideo.autoplay = true;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.srcObject = sourceStream;
    await sourceVideo.play().catch(() => undefined);

    // Ensure intrinsic dimensions are available before first segmentation pass.
    if (!sourceVideo.videoWidth || !sourceVideo.videoHeight) {
      await new Promise<void>((resolve) => {
        const done = () => {
          sourceVideo.removeEventListener("loadedmetadata", done);
          sourceVideo.removeEventListener("resize", done);
          resolve();
        };

        sourceVideo.addEventListener("loadedmetadata", done, { once: true });
        sourceVideo.addEventListener("resize", done, { once: true });
        window.setTimeout(done, 300);
      });
    }

    const width = sourceVideo.videoWidth || sourceTrack.getSettings().width || 1280;
    const height = sourceVideo.videoHeight || sourceTrack.getSettings().height || 720;

    const canvas = document.createElement("canvas");
    canvas.width = Number(width);
    canvas.height = Number(height);

    if (!bodyPixModelRef.current) {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl").catch(() => undefined);
      await tf.ready();
      const bodyPix = await import("@tensorflow-models/body-pix");
      bodyPixModelRef.current = await bodyPix.load({
        architecture: "MobileNetV1",
        outputStride: 16,
        multiplier: 0.5,
        quantBytes: 2,
      });
    }

    const bodyPix = await import("@tensorflow-models/body-pix");
    blurCanvasRef.current = canvas;
    blurVideoRef.current = sourceVideo;

    const renderFrame = async () => {
      if (!blurCanvasRef.current || !blurVideoRef.current || !bodyPixModelRef.current) {
        return;
      }

      const inputVideo = blurVideoRef.current;
      const outputCanvas = blurCanvasRef.current;
      const nextWidth = Number(inputVideo.videoWidth || sourceTrack.getSettings().width || 0);
      const nextHeight = Number(inputVideo.videoHeight || sourceTrack.getSettings().height || 0);

      if (nextWidth > 0 && nextHeight > 0 && (outputCanvas.width !== nextWidth || outputCanvas.height !== nextHeight)) {
        outputCanvas.width = nextWidth;
        outputCanvas.height = nextHeight;
      }

      if (
        inputVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !inputVideo.videoWidth ||
        !inputVideo.videoHeight ||
        !outputCanvas.width ||
        !outputCanvas.height
      ) {
        blurRafRef.current = requestAnimationFrame(() => {
          void renderFrame();
        });
        return;
      }

      try {
        const segmentation = await bodyPixModelRef.current.segmentPerson(inputVideo, {
          internalResolution: "medium",
          segmentationThreshold: 0.7,
        });

        bodyPix.drawBokehEffect(outputCanvas, inputVideo, segmentation, 10, 4, false);
      } catch {
        // Skip transient frame errors while camera dimensions settle.
      }

      blurRafRef.current = requestAnimationFrame(() => {
        void renderFrame();
      });
    };

    void renderFrame();

    const blurredStream = canvas.captureStream(24);
    const blurredTrack = blurredStream.getVideoTracks()[0];
    if (!blurredTrack) {
      return;
    }

    blurProcessedTrackRef.current = blurredTrack;
    await replaceLocalVideoTrack(blurredTrack, false);
    setIsBackgroundBlurEnabled(true);
  }, [isBackgroundBlurEnabled, isScreenSharing, replaceLocalVideoTrack]);

  const disableBackgroundBlur = useCallback(async () => {
    stopBlurPipeline();

    let restoreTrack = baseCameraTrackRef.current;
    if (!restoreTrack || restoreTrack.readyState === "ended") {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      restoreTrack = cameraStream.getVideoTracks()[0] || null;
      baseCameraTrackRef.current = restoreTrack;
    }

    if (restoreTrack) {
      await replaceLocalVideoTrack(restoreTrack, true);
    }

    setIsBackgroundBlurEnabled(false);
  }, [replaceLocalVideoTrack, stopBlurPipeline]);

  const toggleNoiseSuppression = useCallback(async () => {
    if (!isNoiseSuppressionSupported()) {
      console.warn("Noise suppression not supported in this browser");
      return;
    }

    const currentStream = localStreamRef.current;
    if (!currentStream) {
      return;
    }

    if (isNoiseSuppressionEnabled) {
      const originalTrack = baseMicTrackRef.current;
      const activeProcessedTrack = noiseProcessedTrackRef.current;

      if (originalTrack && originalTrack.readyState !== "ended") {
        currentStream.getAudioTracks().forEach((track) => currentStream.removeTrack(track));
        currentStream.addTrack(originalTrack);

        const audioProducer = producersRef.current.get("audio");
        if (audioProducer) {
          await audioProducer.replaceTrack({ track: originalTrack });
        }

        const updated = new MediaStream(currentStream.getTracks());
        localStreamRef.current = updated;
        setLocalStream(updated);
      }

      if (activeProcessedTrack && activeProcessedTrack.readyState !== "ended") {
        activeProcessedTrack.stop();
      }

      if (noiseSuppressionProcessorRef.current) {
        await noiseSuppressionProcessorRef.current.cleanup();
        noiseSuppressionProcessorRef.current = null;
      }

      noiseProcessedTrackRef.current = null;
      setIsNoiseSuppressionEnabled(false);
    } else {
      try {
        const audioTrack = currentStream.getAudioTracks()[0];
        if (!audioTrack) {
          console.warn("No audio track available for noise suppression");
          return;
        }

        baseMicTrackRef.current = audioTrack;
        const sourceStream = new MediaStream([audioTrack]);
        const processor = new NoiseSuppressionProcessor();
        const processedStream = await processor.initialize(sourceStream);

        if (processedStream) {
          const processedAudioTrack = processedStream.getAudioTracks()[0];
          if (processedAudioTrack) {
            const audioProducer = producersRef.current.get("audio");
            if (audioProducer) {
              await audioProducer.replaceTrack({ track: processedAudioTrack });
            }

            currentStream.removeTrack(audioTrack);
            currentStream.addTrack(processedAudioTrack);

            const updated = new MediaStream(currentStream.getTracks());
            localStreamRef.current = updated;
            setLocalStream(updated);

            noiseSuppressionProcessorRef.current = processor;
            noiseProcessedTrackRef.current = processedAudioTrack;
            setIsNoiseSuppressionEnabled(true);
          }
        }
      } catch (error) {
        console.error("Failed to enable noise suppression:", error);
      }
    }
  }, [isNoiseSuppressionEnabled]);

  const updateRemoteStreamForSocket = useCallback(
    (socketId: string, track: MediaStreamTrack) => {
      const existing = remoteMediaRef.current.get(socketId) || new MediaStream();

      const sameKind = existing.getTracks().find((item) => item.kind === track.kind);
      if (sameKind) {
        existing.removeTrack(sameKind);
      }

      existing.addTrack(track);
      remoteMediaRef.current.set(socketId, existing);

      setRemoteStreams((prev) => {
        const idx = prev.findIndex((item) => item.participant.socketId === socketId);
        if (idx === -1) {
          return prev;
        }

        const updated = [...prev];
        updated[idx] = { ...updated[idx], stream: new MediaStream(existing.getTracks()) };
        return updated;
      });
    },
    [],
  );

  const removeSocketMedia = useCallback((socketId: string) => {
    remoteMediaRef.current.delete(socketId);
    setRemoteStreams((prev) => prev.filter((item) => item.participant.socketId !== socketId));

    for (const [producerId, mappedSocketId] of producerSocketRef.current.entries()) {
      if (mappedSocketId !== socketId) {
        continue;
      }

      const consumer = consumersRef.current.get(producerId);
      consumer?.close();
      consumersRef.current.delete(producerId);
      producerSocketRef.current.delete(producerId);
    }
  }, []);

  const removeProducerMedia = useCallback((producerId: string) => {
    const mappedSocketId = producerSocketRef.current.get(producerId);
    const consumer = consumersRef.current.get(producerId);

    if (!mappedSocketId || !consumer) {
      consumersRef.current.delete(producerId);
      producerSocketRef.current.delete(producerId);
      return;
    }

    const stream = remoteMediaRef.current.get(mappedSocketId);
    if (stream) {
      const trackToRemove = stream.getTracks().find((track) => track.id === consumer.track.id);
      if (trackToRemove) {
        stream.removeTrack(trackToRemove);
      }

      setRemoteStreams((prev) =>
        prev.map((item) =>
          item.participant.socketId === mappedSocketId
            ? { ...item, stream: new MediaStream(stream.getTracks()) }
            : item,
        ),
      );
    }

    consumer.close();
    consumersRef.current.delete(producerId);
    producerSocketRef.current.delete(producerId);
  }, []);

  const consumeProducer = useCallback(
    async (producerId: string, producerSocketId: string) => {
      if (consumersRef.current.has(producerId)) {
        return;
      }

      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      if (!device || !recvTransport) {
        return;
      }

      const response = await socketRequest<ConsumeResponse, ConsumePayload>("consume", {
        roomId,
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumer = await recvTransport.consume({
        id: response.params.id,
        producerId: response.params.producerId,
        kind: response.params.kind,
        rtpParameters: response.params.rtpParameters,
      });

      consumersRef.current.set(producerId, consumer);
      producerSocketRef.current.set(producerId, producerSocketId);

      attachPhase1E2eeToConsumer({
        consumer,
        keyStore: e2eeKeyStoreRef.current,
        flags: e2eeFlags,
      });

      // Important: In SFU, each consumed track arrives independently; we merge by participant socketId.
      updateRemoteStreamForSocket(producerSocketId, consumer.track);

      await socketRequest<{ resumed: true }, ResumeConsumerPayload>("resume-consumer", {
        roomId,
        consumerId: consumer.id,
      });
    },
    [e2eeFlags, roomId, socketRequest, updateRemoteStreamForSocket],
  );

  const initializeMediasoup = useCallback(
    async (stream: MediaStream) => {
      const joinPayload: JoinRoomPayload = {
        roomId,
        userId: me.id,
        username: me.username,
        role: me.role,
        inviteToken: joinInviteTokenRef.current || undefined,
        parentInviteToken: joinInviteTokenRef.current || undefined,
        deviceFingerprint: deviceFingerprintRef.current || undefined,
        clientSessionId: getOrCreateClientSessionId(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      };

      const join = await socketRequest<JoinRoomResponse, JoinRoomPayload>("join-room", joinPayload);

      // Non-host: server placed us in the waiting room.
      if (join.status === "waiting") {
        setIsInWaitingRoom(true);
        return;
      }

      const ownSocketId = selfSocketIdRef.current;
      const selfFromJoin = join.roomUsers.find(
        (participant) =>
          participant.socketId === ownSocketId || participant.userId === me.id,
      );
      if (selfFromJoin) {
        setSelfAvatarPath(selfFromJoin.avatarPath ?? null);
        setSelfAvatarVersion(
          selfFromJoin.avatarVersion ??
            (selfFromJoin.avatarPath ? Date.now() : null),
        );
      }

      const others = join.roomUsers.filter((participant) => participant.socketId !== ownSocketId);
      setParticipants(others);
      setRemoteStreams(
        others.map((participant) => ({ participant, stream: new MediaStream() })),
      );
      setTranscriptLines(join.transcriptHistory || []);
      setFileShares(join.fileShareHistory || []);

      if (join.e2ee) {
        applyIncomingE2eeKey(join.e2ee);
      }

      const device = new Device();
      await device.load({ routerRtpCapabilities: join.routerRtpCapabilities });
      deviceRef.current = device;

      const sendTransportResponse = await socketRequest<
        { params: WebRtcTransportParams },
        CreateWebRtcTransportPayload
      >("create-webrtc-transport", {
        roomId,
        direction: "send",
      });

      const sendTransport = device.createSendTransport(sendTransportResponse.params as never);
      sendTransportRef.current = sendTransport;

      sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRequest<{ connected: true }, ConnectWebRtcTransportPayload>(
            "connect-webrtc-transport",
            {
              roomId,
              transportId: sendTransport.id,
              dtlsParameters: dtlsParameters as DtlsParameters,
            },
          );
          callback();
        } catch (error) {
          errback(error as Error);
        }
      });

      sendTransport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const produced = await socketRequest<{ producerId: string }, ProducePayload>("produce", {
            roomId,
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData: appData as Record<string, unknown>,
          });
          callback({ id: produced.producerId });
        } catch (error) {
          errback(error as Error);
        }
      });

      const recvTransportResponse = await socketRequest<
        { params: WebRtcTransportParams },
        CreateWebRtcTransportPayload
      >("create-webrtc-transport", {
        roomId,
        direction: "recv",
      });

      const recvTransport = device.createRecvTransport(recvTransportResponse.params as never);
      recvTransportRef.current = recvTransport;

      recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRequest<{ connected: true }, ConnectWebRtcTransportPayload>(
            "connect-webrtc-transport",
            {
              roomId,
              transportId: recvTransport.id,
              dtlsParameters: dtlsParameters as DtlsParameters,
            },
          );
          callback();
        } catch (error) {
          errback(error as Error);
        }
      });

      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack) {
        const audioProducer = await sendTransport.produce({ track: audioTrack, appData: { mediaTag: "mic" } });
        producersRef.current.set("audio", audioProducer);
        attachPhase1E2eeToProducer({
          producer: audioProducer,
          keyStore: e2eeKeyStoreRef.current,
          flags: e2eeFlags,
        });
      }

      if (videoTrack) {
        // Simulcast: multiple quality layers so SFU can adapt by bandwidth and prioritize speakers.
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          encodings: [
            { rid: "q", maxBitrate: 150_000, scalabilityMode: "S1T3" },
            { rid: "h", maxBitrate: 450_000, scalabilityMode: "S1T3" },
            { rid: "f", maxBitrate: 1_200_000, scalabilityMode: "S1T3" },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
          appData: { mediaTag: "cam" },
        });
        producersRef.current.set("video", videoProducer);
        attachPhase1E2eeToProducer({
          producer: videoProducer,
          keyStore: e2eeKeyStoreRef.current,
          flags: e2eeFlags,
        });
      }

      for (const existingProducer of join.existingProducers) {
        if (!existingProducer.socketId) {
          continue;
        }
        await consumeProducer(existingProducer.producerId, existingProducer.socketId);
      }

      if (e2eeFlags.enabled && e2eeFlags.requireKeyExchange && !e2eeKeyStoreRef.current.hasKey()) {
        setJoinError("E2EE key exchange is required but no key has been published yet.");
      }
    },
    [
      applyIncomingE2eeKey,
      consumeProducer,
      e2eeFlags,
      getOrCreateClientSessionId,
      me.id,
      me.role,
      me.username,
      roomId,
      setIsInWaitingRoom,
      setParticipants,
      setTranscriptLines,
      setFileShares,
      socketRequest,
    ],
  );

  const stopScreenShare = useCallback(() => {
    if (!localStream || !screenTrackRef.current) {
      return;
    }

    screenTrackRef.current.stop();
    screenTrackRef.current = null;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(async (cameraStream) => {
        const nextVideoTrack = cameraStream.getVideoTracks()[0];
        if (!nextVideoTrack) {
          return;
        }

        const localVideoTrack = localStream.getVideoTracks()[0];
        if (localVideoTrack) {
          localStream.removeTrack(localVideoTrack);
          localVideoTrack.stop();
        }

        baseCameraTrackRef.current = nextVideoTrack;
        localStream.addTrack(nextVideoTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));

        const videoProducer = producersRef.current.get("video");
        if (videoProducer) {
          await videoProducer.replaceTrack({ track: nextVideoTrack });
        }

        setScreenSharing(false);
        const payload: PresenceUpdatePayload = {
          roomId,
          userId: me.id,
          isScreenSharing: false,
        };
        getSocket().emit("presence-update", payload);
      })
      .catch(() => {
        setScreenSharing(false);
      });
  }, [localStream, me.id, roomId, setScreenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (!localStream) {
      return;
    }

    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    if (isBackgroundBlurEnabled) {
      await disableBackgroundBlur();
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const displayTrack = displayStream.getVideoTracks()[0];
    if (!displayTrack) {
      return;
    }

    const localVideoTrack = localStream.getVideoTracks()[0];
    if (localVideoTrack) {
      localStream.removeTrack(localVideoTrack);
      localVideoTrack.stop();
    }

    localStream.addTrack(displayTrack);
    setLocalStream(new MediaStream(localStream.getTracks()));

    const videoProducer = producersRef.current.get("video");
    if (videoProducer) {
      await videoProducer.replaceTrack({ track: displayTrack });
    }

    screenTrackRef.current = displayTrack;

    displayTrack.onended = () => {
      stopScreenShare();
    };

    setScreenSharing(true);
    const payload: PresenceUpdatePayload = {
      roomId,
      userId: me.id,
      isScreenSharing: true,
    };
    getSocket().emit("presence-update", payload);
  }, [
    disableBackgroundBlur,
    isBackgroundBlurEnabled,
    isScreenSharing,
    localStream,
    me.id,
    roomId,
    setScreenSharing,
    stopScreenShare,
  ]);

  const toggleMicrophone = useCallback(() => {
    if (!localStream) {
      return;
    }

    const next = !isMicEnabled;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });

    setMicEnabled(next);
    const payload: PresenceUpdatePayload = {
      roomId,
      userId: me.id,
      isMuted: !next,
    };
    getSocket().emit("presence-update", payload);
  }, [isMicEnabled, localStream, me.id, roomId, setMicEnabled]);

  const toggleCamera = useCallback(() => {
    if (!localStream) {
      return;
    }

    const next = !isCameraEnabled;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });

    setCameraEnabled(next);
    const payload: PresenceUpdatePayload = {
      roomId,
      userId: me.id,
      isCameraOff: !next,
    };
    getSocket().emit("presence-update", payload);
  }, [isCameraEnabled, localStream, me.id, roomId, setCameraEnabled]);

  const startRecording = useCallback(async () => {
    if (isRecording) {
      return true;
    }

    try {
      setRecordingError(null);

      if (!navigator.mediaDevices?.getDisplayMedia) {
        setRecordingError("This browser does not support tab recording.");
        return false;
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const chunks: BlobPart[] = [];
      const supportedMimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const mediaRecorder = new MediaRecorder(displayStream, {
        mimeType: supportedMimeType,
      });

      localRecordingStreamRef.current = displayStream;
      localMediaRecorderRef.current = mediaRecorder;

      localRecordingUploadPromiseRef.current = new Promise<string | null>((resolve) => {
        mediaRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          void (async () => {
            displayStream.getTracks().forEach((track) => track.stop());

            const blob = new Blob(chunks, { type: supportedMimeType });
            if (blob.size === 0) {
              setRecordingError("Recording captured no data. Please share the meeting tab and try again.");
              resolve(null);
              return;
            }

            const fileName = `meeting-${roomId}-${Date.now()}.webm`;
            const form = new FormData();
            form.append("file", new File([blob], fileName, { type: "video/webm" }));

            try {
              const response = await fetch(`/api/meetings/${encodeURIComponent(roomId)}/recording`, {
                method: "POST",
                body: form,
              });

              const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
                filePath?: string;
              };

              if (!response.ok || !payload.filePath) {
                setRecordingError(payload.error || "Failed to upload recording.");
                resolve(null);
                return;
              }

              setRecordingPath(payload.filePath);
              resolve(payload.filePath);
            } catch {
              if (isOfflineRecordingSyncSupported()) {
                try {
                  await queueRecordingUpload({
                    roomId,
                    blob,
                    mimeType: supportedMimeType,
                    fileName,
                  });
                  await refreshPendingRecordingUploads();
                  setRecordingError(
                    "Recording saved offline and will sync automatically when you are back online.",
                  );
                } catch {
                  setRecordingError("Failed to upload recording.");
                }
              } else {
                setRecordingError("Failed to upload recording.");
              }
              resolve(null);
            }
          })();
        };
      });

      displayStream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          void stopRecording();
        };
      });

      mediaRecorder.start(1000);
      setRecording(true);
      return true;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to start meeting recording.";
      setRecordingError(message);
      return false;
    }
  }, [isRecording, refreshPendingRecordingUploads, roomId, setRecording]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return recordingPath;
    }

    try {
      const mediaRecorder = localMediaRecorderRef.current;
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      } else if (localRecordingStreamRef.current) {
        localRecordingStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const uploadedPath = await localRecordingUploadPromiseRef.current;

      setRecording(false);
      if (uploadedPath) {
        setRecordingError(null);
        setRecordingPath(uploadedPath);
      }

      localMediaRecorderRef.current = null;
      localRecordingStreamRef.current = null;
      localRecordingUploadPromiseRef.current = null;

      return uploadedPath || recordingPath;
    } catch {
      setRecording(false);
      localMediaRecorderRef.current = null;
      localRecordingStreamRef.current = null;
      localRecordingUploadPromiseRef.current = null;
      return recordingPath;
    }
  }, [isRecording, recordingPath, setRecording]);

  const sendMessage = useCallback(
    (
      text: string,
      options?: {
        replyToMessageId?: string;
        replyToSenderName?: string;
        replyToTextPreview?: string;
      },
    ) => {
      const clean = text.trim();
      if (!clean) {
        return;
      }

      const message: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: me.id,
        senderName: me.username,
        message: clean,
        sentAt: Date.now(),
        replyToMessageId: options?.replyToMessageId ?? null,
        replyToSenderName: options?.replyToSenderName ?? null,
        replyToTextPreview: options?.replyToTextPreview ?? null,
      };

      const payload: ChatPayload = { roomId, message };
      getSocket().emit("chat-message", payload);
      addChatMessage(message);

      // Clear local typing state once a message has been sent.
      const typingPayload: ChatTypingPayload = {
        roomId,
        socketId: selfSocketIdRef.current,
        senderName: me.username,
        isTyping: false,
      };
      getSocket().emit("chat-typing", typingPayload);
    },
    [addChatMessage, me.id, me.username, roomId],
  );

  const setChatTyping = useCallback(
    (isTyping: boolean) => {
      const socketId = selfSocketIdRef.current;
      if (!socketId) {
        return;
      }

      const payload: ChatTypingPayload = {
        roomId,
        socketId,
        senderName: me.username,
        isTyping,
      };
      getSocket().emit("chat-typing", payload);
    },
    [me.username, roomId],
  );

  const markMessageSeen = useCallback(
    (messageId: string, sentAt: number) => {
      const payload: ChatMessageSeenPayload = {
        roomId,
        messageId,
        sentAt,
        userId: me.id,
        name: me.username,
      };
      getSocket().emit("chat-message-seen", payload);
      markChatMessageSeen(messageId, sentAt, me.id, me.username);
    },
    [markChatMessageSeen, me.id, me.username, roomId],
  );

  const addReactionToMessage = useCallback(
    (messageId: string, emoji: string) => {
      const targetMessage = useMeetingStore
        .getState()
        .chatMessages.find((message) => message.id === messageId);
      const hasOwnReaction = Boolean(
        targetMessage?.reactions?.some((item) => item.senderId === me.id && item.emoji === emoji),
      );
      const action: ChatMessageReactionPayload["action"] = hasOwnReaction ? "remove" : "add";

      const reaction: ChatMessageReaction = {
        emoji,
        senderId: me.id,
        senderName: me.username,
        createdAt: Date.now(),
      };

      const payload: ChatMessageReactionPayload = {
        roomId,
        messageId,
        action,
        reaction,
      };

      getSocket().emit("chat-message-reaction", payload);
      if (action === "remove") {
        removeChatMessageReaction(messageId, me.id, emoji);
      } else {
        addChatMessageReaction(messageId, reaction);
      }
    },
    [addChatMessageReaction, me.id, me.username, removeChatMessageReaction, roomId],
  );

  const editOwnMessage = useCallback(
    (messageId: string, nextText: string) => {
      const clean = nextText.trim();
      if (!clean) {
        return;
      }

      const editedAt = Date.now();
      const payload: ChatMessageEditPayload = {
        roomId,
        messageId,
        senderId: me.id,
        message: clean,
        editedAt,
      };

      getSocket().emit("chat-message-edit", payload);
      editChatMessage(messageId, clean, editedAt);
    },
    [editChatMessage, me.id, roomId],
  );

  const deleteOwnMessage = useCallback(
    (messageId: string) => {
      const deletedAt = Date.now();
      const payload: ChatMessageDeletePayload = {
        roomId,
        messageId,
        senderId: me.id,
        deletedAt,
      };

      getSocket().emit("chat-message-delete", payload);
      deleteChatMessage(messageId, deletedAt);
    },
    [deleteChatMessage, me.id, roomId],
  );

  const togglePinMessage = useCallback(
    (messageId: string, currentlyPinned: boolean) => {
      const pinnedAt = currentlyPinned ? null : Date.now();
      const payload: ChatMessagePinPayload = { roomId, messageId, pinnedAt };
      getSocket().emit("chat-message-pin", payload);
      if (currentlyPinned) {
        unpinChatMessage(messageId);
      } else {
        pinChatMessage(messageId, pinnedAt!);
      }
    },
    [pinChatMessage, unpinChatMessage, roomId],
  );

  const shareFile = useCallback(
    async (file: File) => {
      if (!file || file.size === 0) {
        return false;
      }

      if (file.size > 100 * 1024 * 1024) {
        setJoinError("File is too large. Max size is 100MB.");
        return false;
      }

      const form = new FormData();
      form.append("file", file);
      form.append("senderId", me.id);
      form.append("senderName", me.username);

      try {
        const response = await fetch(`/api/meetings/${encodeURIComponent(roomId)}/files`, {
          method: "POST",
          body: form,
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          file?: MeetingFileShare;
        };

        if (!response.ok || !payload.file) {
          setJoinError(payload.error || "Failed to upload file.");
          return false;
        }

        const filePayload: FileSharedPayload = {
          roomId,
          file: payload.file,
        };

        getSocket().emit("file-shared", filePayload);
        addFileShare(payload.file);
        return true;
      } catch {
        setJoinError("Failed to upload file.");
        return false;
      }
    },
    [addFileShare, me.id, me.username, roomId],
  );

  const admitParticipant = useCallback(
    (targetSocketId: string) => {
      const payload: AdmitParticipantPayload = { roomId, socketId: targetSocketId };
      getSocket().emit("admit-participant", payload);
    },
    [roomId],
  );

  const rejectParticipant = useCallback(
    (targetSocketId: string) => {
      const payload: RejectParticipantPayload = { roomId, socketId: targetSocketId };
      getSocket().emit("reject-participant", payload);
    },
    [roomId],
  );

  const raiseHand = useCallback(() => {
    const payload: RaiseHandPayload = { roomId };
    getSocket().emit("raise-hand", payload);
  }, [roomId]);

  const lowerHand = useCallback(
    (targetSocketId: string) => {
      const payload: LowerHandPayload = { roomId, socketId: targetSocketId };
      getSocket().emit("lower-hand", payload);
    },
    [roomId],
  );

  // ── Breakout room controls ────────────────────────────────────────────────
  const createBreakoutRooms = useCallback(
    (count: number, callback?: (rooms: BreakoutRoom[]) => void) => {
      const payload: CreateBreakoutRoomsPayload = { roomId, count };
      getSocket().emit("create-breakout-rooms", payload, (res: { error?: string; breakoutRooms?: BreakoutRoom[] }) => {
        if (res.breakoutRooms) callback?.(res.breakoutRooms);
      });
    },
    [roomId],
  );

  const assignToBreakout = useCallback(
    (assignments: Record<string, string>) => {
      const payload: AssignBreakoutPayload = { roomId, assignments };
      getSocket().emit("assign-to-breakout", payload);
    },
    [roomId],
  );

  const closeBreakoutRooms = useCallback(() => {
    const payload: CloseBreakoutRoomsPayload = { roomId };
    getSocket().emit("close-breakout-rooms", payload);
  }, [roomId]);

  // ── Whiteboard controls ───────────────────────────────────────────────────
  const addWhiteboardElement = useCallback(
    (element: WhiteboardElement) => {
      const payload: WhiteboardElementAddPayload = { roomId, element };
      getSocket().emit("whiteboard-element-add", payload);
      setWhiteboardElements((prev) => [...prev, element]);
    },
    [roomId],
  );

  const updateWhiteboardElement = useCallback(
    (element: WhiteboardElement) => {
      const payload: WhiteboardElementUpdatePayload = { roomId, element };
      getSocket().emit("whiteboard-element-update", payload);
      setWhiteboardElements((prev) => prev.map((item) => (item.id === element.id ? element : item)));
    },
    [roomId],
  );

  const deleteWhiteboardElement = useCallback(
    (elementId: string) => {
      const payload: WhiteboardElementDeletePayload = { roomId, elementId };
      getSocket().emit("whiteboard-element-delete", payload);
      setWhiteboardElements((prev) => prev.filter((item) => item.id !== elementId));
    },
    [roomId],
  );

  const clearWhiteboard = useCallback(() => {
    const payload: WhiteboardClearPayload = { roomId };
    getSocket().emit("whiteboard-clear", payload);
    setWhiteboardElements([]);
  }, [roomId]);

  const replaceWhiteboardElements = useCallback(
    (elements: WhiteboardElement[]) => {
      const payload: WhiteboardElementsReplacePayload = { roomId, elements };
      getSocket().emit("whiteboard-elements-replace", payload);
      setWhiteboardElements(elements);
    },
    [roomId],
  );

  const updateWhiteboardCursor = useCallback(
    (x: number, y: number) => {
      const cursor: WhiteboardCursorState = {
        socketId: selfSocketIdRef.current,
        participantName: me.username,
        x,
        y,
        updatedAt: Date.now(),
      };
      const payload: WhiteboardCursorMovePayload = { roomId, cursor };
      getSocket().emit("whiteboard-cursor-move", payload);
      setWhiteboardCursors((prev) => {
        const idx = prev.findIndex((item) => item.socketId === cursor.socketId);
        if (idx < 0) return [...prev, cursor];
        const next = [...prev];
        next[idx] = cursor;
        return next;
      });
    },
    [me.username, roomId],
  );

  // ── Webinar controls ──────────────────────────────────────────────────────
  const setWebinarModeControl = useCallback(
    (enabled: boolean) => {
      const payload: SetWebinarModePayload = { roomId, enabled };
      getSocket().emit("set-webinar-mode", payload);
    },
    [roomId],
  );

  const promoteToPresenter = useCallback(
    (targetSocketId: string) => {
      const payload: PromoteToPresenterPayload = { roomId, targetSocketId };
      getSocket().emit("promote-to-presenter", payload);
    },
    [roomId],
  );

  const demoteToAttendee = useCallback(
    (targetSocketId: string) => {
      const payload: DemoteToAttendeePayload = { roomId, targetSocketId };
      getSocket().emit("demote-to-attendee", payload);
    },
    [roomId],
  );

  // ── Ultra-low bandwidth mode ───────────────────────────────────────────────
  const toggleLowBandwidthMode = useCallback(async () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (isLowBandwidthMode) {
      // Restore normal quality
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });
        } catch { /* best-effort */ }
      }
      setIsLowBandwidthMode(false);
    } else {
      // Apply low-bandwidth constraints: 320×180 @ 15fps
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({ width: { max: 320 }, height: { max: 180 }, frameRate: { max: 15 } });
        } catch { /* best-effort */ }
      }
      setIsLowBandwidthMode(true);
    }
  }, [isLowBandwidthMode]);

  // ── Voice-controlled meetings ──────────────────────────────────────────────
  const stopVoiceControl = useCallback(() => {
    voiceControlEnabledRef.current = false;
    if (voiceRecognitionRef.current) {
      try { voiceRecognitionRef.current.abort(); } catch { /* ignore */ }
      voiceRecognitionRef.current = null;
    }
    setIsVoiceControlEnabled(false);
    setLastVoiceCommand(null);
  }, []);

  const startVoiceControl = useCallback(
    (controls: {
      toggleMicrophone: () => void;
      toggleCamera: () => void;
      toggleScreenShare: () => Promise<void>;
      raiseHand: () => void;
      lowerHand: (socketId: string) => void;
      leaveRoom: () => void;
    }) => {
      const SpeechRecognitionCtor =
        (typeof window !== "undefined" &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
      if (!SpeechRecognitionCtor) {
        console.warn("[voice-control] Web Speech API not supported in this browser");
        return;
      }

      voiceControlEnabledRef.current = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const recognition = new SpeechRecognitionCtor();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recognition.continuous = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recognition.interimResults = false;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recognition.lang = "en-US";
      voiceRecognitionRef.current = recognition;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recognition.onresult = (event: { results: ArrayLike<{ [index: number]: { transcript: string } }> }) => {
        const results = Array.from(event.results as ArrayLike<ArrayLike<{ transcript: string }>>);
        const transcript = results
          .map((r) => (r[0]?.transcript ?? ""))
          .join(" ")
          .toLowerCase()
          .trim();

        if (!transcript) return;
        setLastVoiceCommand(transcript);

        if (transcript.includes("mute") || transcript.includes("silence")) controls.toggleMicrophone();
        else if (transcript.includes("unmute")) controls.toggleMicrophone();
        else if (transcript.includes("camera off") || transcript.includes("stop camera")) controls.toggleCamera();
        else if (transcript.includes("camera on") || transcript.includes("start camera")) controls.toggleCamera();
        else if (transcript.includes("share screen") || transcript.includes("start sharing")) void controls.toggleScreenShare();
        else if (transcript.includes("stop sharing") || transcript.includes("stop screen")) void controls.toggleScreenShare();
        else if (transcript.includes("raise hand")) controls.raiseHand();
        else if (transcript.includes("lower hand") || transcript.includes("put hand down")) controls.lowerHand(selfSocketIdRef.current);
        else if (transcript.includes("leave meeting") || transcript.includes("end call")) controls.leaveRoom();
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recognition.onerror = () => { /* ignore minor errors */ };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recognition.onend = () => {
        // Restart automatically if still enabled
        if (voiceControlEnabledRef.current) {
          try { (voiceRecognitionRef.current as { start: () => void } | null)?.start(); } catch { /* ignore */ }
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      recognition.start();
      setIsVoiceControlEnabled(true);
    },
    [],
  );

  // ── Auto camera framing ────────────────────────────────────────────────────
  const stopAutoFramePipeline = useCallback(() => {
    if (autoFrameRafRef.current) {
      cancelAnimationFrame(autoFrameRafRef.current);
      autoFrameRafRef.current = null;
    }
    if (autoFrameProcessedTrackRef.current) {
      autoFrameProcessedTrackRef.current.stop();
      autoFrameProcessedTrackRef.current = null;
    }
    if (autoFrameVideoRef.current) {
      autoFrameVideoRef.current.pause();
      autoFrameVideoRef.current.srcObject = null;
      autoFrameVideoRef.current = null;
    }
    autoFrameCanvasRef.current = null;
  }, []);

  const enableAutoFrame = useCallback(async () => {
    if (isAutoFrameEnabled) return;
    // Disable background blur while framing is active (they share the same video track)
    if (isBackgroundBlurEnabled) {
      await disableBackgroundBlur();
    }
    const currentTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!currentTrack) return;

    // Load BodyPix model if not yet loaded
    if (!bodyPixModelRef.current) {
      const bp = await import("@tensorflow-models/body-pix");
      await import("@tensorflow/tfjs-backend-webgl");
      bodyPixModelRef.current = await bp.load({ architecture: "MobileNetV1", outputStride: 16, multiplier: 0.75, quantBytes: 2 });
    }
    const model = bodyPixModelRef.current;

    const W = 640, H = 480;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.width = W;
    video.height = H;
    video.srcObject = new MediaStream([currentTrack]);
    await video.play();

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) { video.srcObject = null; return; }

    autoFrameVideoRef.current = video;
    autoFrameCanvasRef.current = canvas;

    const FACE_PARTS = new Set([0, 1, 11, 12]);   // leftFace, rightFace, leftEar, rightEar
    let smoothBox = { x: 0, y: 0, w: W, h: H };

    const processFrame = async () => {
      const vid = autoFrameVideoRef.current;
      const cvs = autoFrameCanvasRef.current;
      if (!vid || !cvs || vid.readyState < 2) {
        autoFrameRafRef.current = requestAnimationFrame(processFrame);
        return;
      }
      try {
        const seg = await model.segmentPersonParts(vid, {
          flipHorizontal: false, internalResolution: "low", segmentationThreshold: 0.5,
        });
        let minX = seg.width, minY = seg.height, maxX = 0, maxY = 0, found = false;
        for (let i = 0; i < seg.data.length; i++) {
          if (FACE_PARTS.has(seg.data[i])) {
            found = true;
            const px = i % seg.width, py = Math.floor(i / seg.width);
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
        if (found) {
          const sx = (vid.videoWidth || W) / seg.width;
          const sy = (vid.videoHeight || H) / seg.height;
          const faceCx = ((minX + maxX) / 2) * sx;
          const faceCy = ((minY + maxY) / 2) * sy * 0.9;
          const faceH = (maxY - minY) * sy;
          const cropH = Math.min(Math.max(faceH * 2.4, 200), vid.videoHeight || H);
          const cropW = cropH * (W / H);
          const targetX = Math.max(0, Math.min(faceCx - cropW / 2, (vid.videoWidth || W) - cropW));
          const targetY = Math.max(0, Math.min(faceCy - cropH * 0.38, (vid.videoHeight || H) - cropH));
          const LERP = 0.08;
          smoothBox = {
            x: smoothBox.x + (targetX - smoothBox.x) * LERP,
            y: smoothBox.y + (targetY - smoothBox.y) * LERP,
            w: smoothBox.w + (cropW - smoothBox.w) * LERP,
            h: smoothBox.h + (cropH - smoothBox.h) * LERP,
          };
        }
      } catch { /* segmentation may fail on some frames */ }
      ctx.drawImage(vid, smoothBox.x, smoothBox.y, smoothBox.w, smoothBox.h, 0, 0, W, H);
      if (autoFrameRafRef.current !== null) {
        autoFrameRafRef.current = requestAnimationFrame(processFrame);
      }
    };
    autoFrameRafRef.current = requestAnimationFrame(processFrame);

    const framedStream = canvas.captureStream(30);
    const framedTrack = framedStream.getVideoTracks()[0];
    if (!framedTrack) { stopAutoFramePipeline(); return; }
    autoFrameProcessedTrackRef.current = framedTrack;
    await replaceLocalVideoTrack(framedTrack, false);
    setIsAutoFrameEnabled(true);
  }, [isAutoFrameEnabled, isBackgroundBlurEnabled, disableBackgroundBlur, replaceLocalVideoTrack, stopAutoFramePipeline]);

  const disableAutoFrame = useCallback(async () => {
    stopAutoFramePipeline();
    if (baseCameraTrackRef.current) {
      await replaceLocalVideoTrack(baseCameraTrackRef.current, false);
    }
    setIsAutoFrameEnabled(false);
  }, [replaceLocalVideoTrack, stopAutoFramePipeline]);

  const toggleAutoFrame = useCallback(async () => {
    if (isAutoFrameEnabled) await disableAutoFrame();
    else await enableAutoFrame();
  }, [isAutoFrameEnabled, disableAutoFrame, enableAutoFrame]);

  // ── Emotion detection ──────────────────────────────────────────────────────
  // Runs locally on the user's own video frame every 3 s and broadcasts an
  // emoji-based emotion estimate to room peers via the signaling server.
  const stopEmotionDetection = useCallback(() => {
    if (emotionIntervalRef.current) {
      clearInterval(emotionIntervalRef.current);
      emotionIntervalRef.current = null;
    }
    emotionPrevDataRef.current = null;
  }, []);

  const startEmotionDetection = useCallback(() => {
    if (emotionIntervalRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    emotionCanvasRef.current = canvas;

    emotionIntervalRef.current = setInterval(() => {
      const video = localStreamRef.current?.getVideoTracks()[0];
      if (!video || video.readyState === "ended") return;
      const cvs = emotionCanvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;

      // Capture current frame from local video element (if any)
      const videoEls = typeof document !== "undefined"
        ? Array.from(document.querySelectorAll<HTMLVideoElement>("video"))
        : [];
      const localVideoEl = videoEls.find((el) => el.muted && el.srcObject instanceof MediaStream && (el.srcObject as MediaStream).getVideoTracks()[0]?.id === video.id);
      if (!localVideoEl) return;

      ctx.drawImage(localVideoEl, 0, 0, cvs.width, cvs.height);
      const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
      const current = imageData.data;

      // Motion energy: mean absolute difference between consecutive frames
      let motion = 0;
      const prev = emotionPrevDataRef.current;
      if (prev && prev.length === current.length) {
        for (let i = 0; i < current.length; i += 4) {
          motion += Math.abs(current[i] - prev[i]) + Math.abs(current[i + 1] - prev[i + 1]) + Math.abs(current[i + 2] - prev[i + 2]);
        }
        motion /= (current.length / 4);
      }
      emotionPrevDataRef.current = new Uint8ClampedArray(current);
      if (!prev) return; // First frame — no diff yet

      // Mean brightness in upper 40% (eyes region) vs lower 40% (mouth region)
      const rows = cvs.height, cols = cvs.width;
      let eyeBright = 0, mouthBright = 0, eyeCount = 0, mouthCount = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = (row * cols + col) * 4;
          const brightness = (current[idx] * 0.299 + current[idx + 1] * 0.587 + current[idx + 2] * 0.114);
          if (row < rows * 0.4) { eyeBright += brightness; eyeCount++; }
          if (row > rows * 0.6) { mouthBright += brightness; mouthCount++; }
        }
      }
      eyeBright = eyeCount > 0 ? eyeBright / eyeCount : 0;
      mouthBright = mouthCount > 0 ? mouthBright / mouthCount : 0;

      let emotion: string;
      if (motion > 12) {
        emotion = eyeBright > mouthBright * 1.1 ? "😮" : "😊";
      } else if (motion > 4) {
        emotion = "😐";
      } else {
        emotion = "😌";
      }

      // Update own emotion locally
      const mySocketId = selfSocketIdRef.current;
      if (mySocketId) {
        setEmotionBySocketId((prev) => ({ ...prev, [mySocketId]: emotion }));
        // Broadcast to peers
        const socket = getSocket();
        socket.emit("emotion-update", { roomId, socketId: mySocketId, emotion });
      }
    }, 3000);
  }, [roomId]);

  const sendReaction = useCallback(
    (emoji: ReactionEmoji) => {
      const payload: SendReactionPayload = { roomId, emoji };
      getSocket().emit("send-reaction", payload);
    },
    [roomId],
  );

  const applyHostSecurityAction = useCallback(
    (payload: Omit<HostSecurityActionPayload, "roomId">) => {
      const actionPayload: HostSecurityActionPayload = {
        roomId,
        ...payload,
      };
      getSocket().emit("host-security-action", actionPayload);
    },
    [roomId],
  );

  const toggleBackgroundBlur = useCallback(async () => {
    if (isBackgroundBlurEnabled) {
      await disableBackgroundBlur();
      return;
    }

    await enableBackgroundBlur();
  }, [disableBackgroundBlur, enableBackgroundBlur, isBackgroundBlurEnabled]);

  const leaveRoom = useCallback(() => {
    const socket = getSocket();

    if (me.role === "host") {
      socketRequest<{ stopped: boolean }, StopTranscriptionPayload>("stop-transcription", {
        roomId,
      }).catch(() => undefined);
    }

    socket.emit("leave-room", { roomId, userId: me.id });

    consumersRef.current.forEach((consumer) => consumer.close());
    producersRef.current.forEach((producer) => producer.close());

    consumersRef.current.clear();
    producersRef.current.clear();
    producerSocketRef.current.clear();
    remoteMediaRef.current.clear();

    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;

    e2eeKeyStoreRef.current.clear();
    setE2eeState({
      keyEpoch: 0,
      keyFingerprint: null,
      keyMaterialB64: null,
      ackedParticipantCount: 0,
      expectedParticipantCount: 0,
      lastAckedSocketId: null,
    });

    // Cleanup noise suppression
    if (noiseSuppressionProcessorRef.current) {
      noiseSuppressionProcessorRef.current.cleanup();
      noiseSuppressionProcessorRef.current = null;
    }

    if (noiseProcessedTrackRef.current && noiseProcessedTrackRef.current.readyState !== "ended") {
      noiseProcessedTrackRef.current.stop();
      noiseProcessedTrackRef.current = null;
    }

    // Cleanup background blur
    stopBlurPipeline();

    localStream?.getTracks().forEach((track) => track.stop());

      // Cleanup new features
      stopAutoFramePipeline();
      stopVoiceControl();
      stopEmotionDetection();

    stopRecording();
    disconnectSocket();
  }, [localStream, me.id, me.role, roomId, socketRequest, stopRecording]);

  useEffect(() => {
    void refreshPendingRecordingUploads();
    void syncPendingRecordings();

    const handleOnline = () => {
      void syncPendingRecordings();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [refreshPendingRecordingUploads, syncPendingRecordings]);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    let mounted = true;
    const typingTimeouts = typingTimeoutsRef.current;

    const bootstrap = async () => {
      setJoinError(null);
      if (typeof window !== "undefined") {
        const urlToken = new URL(window.location.href).searchParams.get("invite");
        joinInviteTokenRef.current = inviteToken || urlToken || null;
      }

      getOrCreateClientSessionId();
      await buildDeviceFingerprint();

      const socket = getSocket();
      if (!socket.connected) {
        await new Promise<void>((resolve, reject) => {
          const onConnect = () => {
            socket.off("connect_error", onError);
            resolve();
          };
          const onError = (error: Error) => {
            socket.off("connect", onConnect);
            reject(error);
          };

          socket.once("connect", onConnect);
          socket.once("connect_error", onError);
          socket.connect();
        });
      }

      if (!socket.connected) {
        return;
      }

      socket.on("connect", () => {
        selfSocketIdRef.current = socket.id ?? "";
      });

      if (!socket.connected) {
        socket.connect();
      }
      selfSocketIdRef.current = socket.id ?? "";

      const stream = await setupLocalMedia();
      if (!mounted) {
        return;
      }

      setRoomContext(roomId, me);

      socket.on("new-producer", ({ producerId, socketId }: { producerId: string; socketId: string }) => {
        consumeProducer(producerId, socketId).catch(() => undefined);
      });

      socket.on("active-speaker", ({ socketId }: { socketId: string | null }) => {
        setActiveSpeakerSocketId(socketId);
      });

      socket.on("producer-closed", ({ producerId }: { producerId: string }) => {
        removeProducerMedia(producerId);
      });

      socket.on("recording-stopped", ({ filePath }: { roomId: string; filePath: string }) => {
        setRecording(false);
        if (filePath) {
          setRecordingPath(filePath);
        }
      });

      socket.on("recording-error", ({ error }: { roomId: string; error: string }) => {
        setRecording(false);
        setRecordingError(error || "Recording stopped unexpectedly.");
      });

      socket.on("user-joined", (participant: Participant) => {
        if (participant.socketId === selfSocketIdRef.current) {
          return;
        }

        upsertParticipant(participant);
        setRemoteStreams((prev) => {
          if (prev.some((item) => item.participant.socketId === participant.socketId)) {
            return prev;
          }

          return [...prev, { participant, stream: new MediaStream() }];
        });
      });

      socket.on("presence-updated", (participant: Participant) => {
        if (participant.socketId === selfSocketIdRef.current) {
          setSelfAvatarPath(participant.avatarPath ?? null);
          setSelfAvatarVersion(participant.avatarVersion ?? null);
          return;
        }

        upsertParticipant(participant);
        setRemoteStreams((prev) =>
          prev.map((streamItem) =>
            streamItem.participant.socketId === participant.socketId
              ? { ...streamItem, participant }
              : streamItem,
          ),
        );
      });

      socket.on("chat-message", (payload: ChatPayload) => {
        addChatMessage(payload.message);
      });

      socket.on("chat-typing", (payload: ChatTypingPayload) => {
        if (!payload.socketId || payload.socketId === selfSocketIdRef.current) {
          return;
        }

        const existingTimeout = typingTimeoutsRef.current.get(payload.socketId);
        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
          typingTimeoutsRef.current.delete(payload.socketId);
        }

        if (!payload.isTyping) {
          setTypingBySocketId((prev) => {
            if (!(payload.socketId in prev)) {
              return prev;
            }

            const next = { ...prev };
            delete next[payload.socketId];
            return next;
          });
          return;
        }

        setTypingBySocketId((prev) => ({
          ...prev,
          [payload.socketId]: payload.senderName,
        }));

        const timeoutId = window.setTimeout(() => {
          typingTimeoutsRef.current.delete(payload.socketId);
          setTypingBySocketId((prev) => {
            if (!(payload.socketId in prev)) {
              return prev;
            }

            const next = { ...prev };
            delete next[payload.socketId];
            return next;
          });
        }, 3000);

        typingTimeoutsRef.current.set(payload.socketId, timeoutId);
      });

      socket.on("chat-message-reaction", (payload: ChatMessageReactionPayload) => {
        if (payload.action === "remove") {
          removeChatMessageReaction(payload.messageId, payload.reaction.senderId, payload.reaction.emoji);
        } else {
          addChatMessageReaction(payload.messageId, payload.reaction);
        }
      });

      socket.on("chat-message-edit", (payload: ChatMessageEditPayload) => {
        editChatMessage(payload.messageId, payload.message, payload.editedAt);
      });

      socket.on("chat-message-delete", (payload: ChatMessageDeletePayload) => {
        deleteChatMessage(payload.messageId, payload.deletedAt);
      });

      socket.on("chat-message-pin", (payload: ChatMessagePinPayload) => {
        if (payload.pinnedAt === null) {
          unpinChatMessage(payload.messageId);
        } else {
          pinChatMessage(payload.messageId, payload.pinnedAt);
        }
      });

      socket.on("chat-message-seen", (payload: ChatMessageSeenPayload) => {
        markChatMessageSeen(payload.messageId, payload.sentAt, payload.userId, payload.name);
      });

      socket.on("file-shared", (payload: FileSharedPayload) => {
        addFileShare(payload.file);
      });

      socket.on("transcript-line", (line: TranscriptLine) => {
        addTranscriptLine(line);
      });

        socket.on("emotion-update", (payload: EmotionUpdatePayload) => {
          setEmotionBySocketId((prev) => ({ ...prev, [payload.socketId]: payload.emotion }));
        });

      socket.on("waiting-room-update", (payload: WaitingRoomUpdatePayload) => {
        setWaitingRoom(payload.waiting);
      });

      socket.on("hand-raised-update", (payload: HandRaisedUpdatePayload) => {
        setRaisedHands(payload.raisedHands);
      });

      // Breakout rooms
      socket.on("breakout-update", (payload: BreakoutUpdatePayload) => {
        setBreakoutRooms(payload.breakoutRooms);
      });
      socket.on("breakout-assigned", (payload: BreakoutAssignedPayload) => {
        setAssignedBreakoutRoom(payload);
      });
      socket.on("breakout-closed", (_payload: BreakoutClosedPayload) => {
        setAssignedBreakoutRoom(null);
      });

      // Whiteboard
      socket.on("whiteboard-elements-state", (payload: WhiteboardElementsStatePayload) => {
        setWhiteboardElements(payload.elements);
      });
      socket.on("whiteboard-element-added", (payload: WhiteboardElementAddPayload) => {
        setWhiteboardElements((prev) => [...prev, payload.element]);
      });
      socket.on("whiteboard-element-updated", (payload: WhiteboardElementUpdatePayload) => {
        setWhiteboardElements((prev) => prev.map((item) => (item.id === payload.element.id ? payload.element : item)));
      });
      socket.on("whiteboard-element-deleted", (payload: WhiteboardElementDeletePayload) => {
        setWhiteboardElements((prev) => prev.filter((item) => item.id !== payload.elementId));
      });
      socket.on("whiteboard-clear", () => {
        setWhiteboardElements([]);
      });
      socket.on("whiteboard-cursor-state", (payload: WhiteboardCursorStatePayload) => {
        setWhiteboardCursors(payload.cursors);
      });
      socket.on("whiteboard-cursor-move", (payload: WhiteboardCursorMovePayload) => {
        const next = payload.cursor;
        setWhiteboardCursors((prev) => {
          const idx = prev.findIndex((item) => item.socketId === next.socketId);
          if (idx < 0) return [...prev, next];
          const cloned = [...prev];
          cloned[idx] = next;
          return cloned;
        });
      });
      socket.on("whiteboard-cursor-remove", (payload: { roomId: string; socketId: string }) => {
        setWhiteboardCursors((prev) => prev.filter((item) => item.socketId !== payload.socketId));
      });

      // Webinar
      socket.on("webinar-state", (payload: WebinarStatePayload) => {
        setWebinarMode(payload.webinarMode);
        setPresenterSocketIds(payload.presenterSocketIds);
      });

      socket.on("e2ee-key-update", (payload: E2eeKeyUpdatePayload) => {
        if (payload.roomId !== roomId) {
          return;
        }
        applyIncomingE2eeKey(payload);
      });

      socket.on("e2ee-key-ack", (_payload: E2eeKeyAckPayload) => {
        setE2eeState((prev) => ({
          ...prev,
          ackedParticipantCount: _payload.ackedParticipantCount ?? prev.ackedParticipantCount,
          expectedParticipantCount: _payload.expectedParticipantCount ?? prev.expectedParticipantCount,
          lastAckedSocketId: _payload.lastAckedSocketId ?? _payload.socketId ?? prev.lastAckedSocketId,
        }));
      });

      socket.on("reaction", (payload: ReactionEventPayload) => {
        const id = `${payload.senderSocketId}-${payload.createdAt}-${Math.random().toString(36).slice(2, 6)}`;
        setFloatingReactions((prev) => [...prev, { id, emoji: payload.emoji }]);

        const timeoutId = window.setTimeout(() => {
          setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
        }, 1800);
        reactionTimeoutsRef.current.push(timeoutId);
      });

      socket.on("security-alert", (payload: SecurityAlertPayload) => {
        setSecurityAlerts((prev) => [payload, ...prev].slice(0, 20));
      });

      socket.on("meeting-lock-updated", (payload: { roomId: string; locked: boolean }) => {
        if (payload.roomId !== roomId) {
          return;
        }
        setIsMeetingLocked(payload.locked);
      });

      socket.on("removed-by-host", (payload: { reason?: string }) => {
        setJoinError(payload.reason || "You were removed by host.");
        leaveRoom();
      });

      socket.on("admission-decision", (decision: AdmissionDecisionPayload) => {
        if (!decision.admitted) {
          setIsInWaitingRoom(false);
          setJoinError("Host rejected your request to join this meeting.");
          // Surface rejection — callers can read isInWaitingRoom===false when isReady===false.
          return;
        }

        setIsInWaitingRoom(false);
        const stream = localStreamRef.current;
        if (stream) {
          initializeMediasoup(stream).catch(() => undefined);
        }
      });

      socket.on("user-left", ({ socketId }: { socketId: string }) => {
        removeParticipant(socketId);
        removeSocketMedia(socketId);
      });

      await initializeMediasoup(stream);

      if (me.role === "host") {
        socketRequest<{ started: boolean }, StartTranscriptionPayload>("start-transcription", {
          roomId,
        }).catch(() => undefined);

        if (e2eeFlags.enabled) {
          void publishNewE2eeKey();
          if (e2eeRotationTimerRef.current) {
            window.clearInterval(e2eeRotationTimerRef.current);
          }

          e2eeRotationTimerRef.current = window.setInterval(() => {
            void publishNewE2eeKey();
          }, Math.max(30, e2eeFlags.keyRotationSeconds) * 1000);
        }
      }
    };

    bootstrap().catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Could not join the meeting. Verify both users are using the same meeting link.";
      setJoinError(message);
    });

    return () => {
      mounted = false;
      reactionTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      reactionTimeoutsRef.current = [];
      typingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      typingTimeouts.clear();
      if (e2eeRotationTimerRef.current) {
        window.clearInterval(e2eeRotationTimerRef.current);
        e2eeRotationTimerRef.current = null;
      }
      stopBlurPipeline();
      leaveRoom();
      const socket = getSocket();
      socket.removeAllListeners();
      initializedRef.current = false;
    };
    // Intentionally scope bootstrap lifecycle to meeting identity only.
    // Re-running this effect mid-call causes unnecessary leave/rejoin cycles in dev.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyIncomingE2eeKey,
    e2eeFlags.enabled,
    e2eeFlags.keyRotationSeconds,
    inviteToken,
    me.id,
    me.role,
    me.username,
    publishNewE2eeKey,
    roomId,
  ]);

  const participants = useMeetingStore((state) => state.participants);
  const chatMessages = useMeetingStore((state) => state.chatMessages);
  const storedFileShares = useMeetingStore((state) => state.fileShares);
  const transcriptLines = useMeetingStore((state) => state.transcriptLines);

  const prioritizedRemoteStreams = useMemo(() => {
    if (!activeSpeakerSocketId) {
      return remoteStreams;
    }

    const active = remoteStreams.filter(
      (item) => item.participant.socketId === activeSpeakerSocketId,
    );
    const rest = remoteStreams.filter(
      (item) => item.participant.socketId !== activeSpeakerSocketId,
    );

    return [...active, ...rest];
  }, [activeSpeakerSocketId, remoteStreams]);

  const selfParticipant = useMemo<Participant>(() => {
    return {
      socketId: "local",
      userId: me.id,
      username: me.username,
      role: me.role,
      isMuted: !isMicEnabled,
      isCameraOff: !isCameraEnabled,
      isScreenSharing,
      avatarPath: selfAvatarPath,
      avatarVersion: selfAvatarVersion,
    };
  }, [isCameraEnabled, isMicEnabled, isScreenSharing, me.id, me.role, me.username, selfAvatarPath, selfAvatarVersion]);

  const typingParticipantNames = useMemo(
    () => Array.from(new Set(Object.values(typingBySocketId))).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [typingBySocketId],
  );

  return {
    isReady,
    iceServers,
    localStream,
    remoteStreams: prioritizedRemoteStreams,
    activeSpeakerSocketId,
    participants,
    chatMessages,
    fileShares: storedFileShares,
    transcriptLines,
    selfParticipant,
    isInWaitingRoom,
    waitingRoom,
    raisedHands,
    floatingReactions,
    joinError,
    recordingError,
    pendingRecordingUploads,
    isSyncingRecordings,
    securityAlerts,
    isMeetingLocked,
    selfSocketId: selfSocketIdRef.current,
    // Breakout rooms
    breakoutRooms,
    assignedBreakoutRoom,
    // Whiteboard
    whiteboardElements,
    whiteboardCursors,
    // Webinar
    webinarMode,
    presenterSocketIds,
    typingParticipantNames,
    e2ee: {
      enabled: e2eeFlags.enabled,
      keyEpoch: e2eeState.keyEpoch,
      keyFingerprint: e2eeState.keyFingerprint,
      hasKey: Boolean(e2eeState.keyMaterialB64),
      algorithm: e2eeFlags.algorithm,
      ackedParticipantCount: e2eeState.ackedParticipantCount,
      expectedParticipantCount: e2eeState.expectedParticipantCount,
      pendingParticipantCount: Math.max(
        0,
        e2eeState.expectedParticipantCount - e2eeState.ackedParticipantCount,
      ),
      lastAckedSocketId: e2eeState.lastAckedSocketId,
    },
    isAttendee: webinarMode && !presenterSocketIds.includes(selfSocketIdRef.current),
    controls: {
      toggleMicrophone,
      toggleCamera,
      toggleScreenShare,
      toggleBackgroundBlur,
      toggleNoiseSuppression,
      leaveRoom,
      startRecording,
      stopRecording,
      syncPendingRecordings,
      sendMessage,
      setChatTyping,
      markMessageSeen,
      addReactionToMessage,
      editOwnMessage,
      deleteOwnMessage,
      togglePinMessage,
      shareFile,
      sendReaction,
      applyHostSecurityAction,
      admitParticipant,
      rejectParticipant,
      raiseHand,
      lowerHand,
      isMicEnabled,
      isCameraEnabled,
      isScreenSharing,
      isBackgroundBlurEnabled,
      isNoiseSuppressionEnabled,
      isRecording,
      pendingRecordingUploads,
      isSyncingRecordings,
      recordingPath,
      // Breakout controls
      createBreakoutRooms,
      assignToBreakout,
      closeBreakoutRooms,
      // Whiteboard controls
      addWhiteboardElement,
      updateWhiteboardElement,
      deleteWhiteboardElement,
      clearWhiteboard,
      replaceWhiteboardElements,
      updateWhiteboardCursor,
      // Webinar controls
      setWebinarMode: setWebinarModeControl,
      promoteToPresenter,
      demoteToAttendee,
      // Low-bandwidth mode
      isLowBandwidthMode,
      toggleLowBandwidthMode,
      // Voice control
      isVoiceControlEnabled,
      lastVoiceCommand,
      toggleVoiceControl: () => {
        if (isVoiceControlEnabled) {
          stopVoiceControl();
        } else {
          startVoiceControl({
            toggleMicrophone,
            toggleCamera,
            toggleScreenShare,
            raiseHand: () => getSocket().emit("raise-hand", { roomId }),
            lowerHand: (sid: string) => getSocket().emit("lower-hand", { roomId, socketId: sid }),
            leaveRoom,
          });
        }
      },
      // Auto camera framing
      isAutoFrameEnabled,
      toggleAutoFrame,
      // Emotion detection
      startEmotionDetection,
      stopEmotionDetection,
    },
    emotionBySocketId,
  };
}


