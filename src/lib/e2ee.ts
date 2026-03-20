export type Phase1E2eeFlags = {
  enabled: boolean;
  requireKeyExchange: boolean;
  keyRotationSeconds: number;
  algorithm: "xor-v1";
};

export type E2eeRuntimeState = {
  keyEpoch: number;
  keyFingerprint: string | null;
  keyMaterialB64: string | null;
};

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getPhase1E2eeFlags(): Phase1E2eeFlags {
  const enabled = String(process.env.NEXT_PUBLIC_E2EE_PHASE1_ENABLED || "false").toLowerCase() === "true";
  const requireKeyExchange =
    String(process.env.NEXT_PUBLIC_E2EE_PHASE1_REQUIRE_KEY_EXCHANGE || "false").toLowerCase() === "true";

  return {
    enabled,
    requireKeyExchange,
    keyRotationSeconds: readNumber(process.env.NEXT_PUBLIC_E2EE_PHASE1_KEY_ROTATION_SECONDS, 900),
    algorithm: "xor-v1",
  };
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    const bin = window.atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  // Node fallback for tests/tooling.
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Node fallback for tests/tooling.
  return Buffer.from(bytes).toString("base64");
}

export async function sha256Hex(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
  return hash;
}

export async function createPhase1KeyMaterial(): Promise<{ keyMaterialB64: string; fingerprint: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const keyMaterialB64 = bytesToBase64(bytes);
  const fingerprint = await sha256Hex(keyMaterialB64);
  return { keyMaterialB64, fingerprint };
}

export class Phase1E2eeKeyStore {
  private keyEpoch = 0;

  private keyBytes: Uint8Array | null = null;

  private keyFingerprint: string | null = null;

  setKey(params: { keyEpoch: number; keyMaterialB64: string; keyFingerprint?: string | null }): boolean {
    if (!params.keyMaterialB64.trim()) {
      return false;
    }

    if (params.keyEpoch < this.keyEpoch) {
      return false;
    }

    try {
      this.keyBytes = base64ToBytes(params.keyMaterialB64);
      this.keyEpoch = params.keyEpoch;
      this.keyFingerprint = params.keyFingerprint || null;
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    this.keyBytes = null;
    this.keyFingerprint = null;
    this.keyEpoch = 0;
  }

  getState(): E2eeRuntimeState {
    return {
      keyEpoch: this.keyEpoch,
      keyFingerprint: this.keyFingerprint,
      keyMaterialB64: this.keyBytes ? bytesToBase64(this.keyBytes) : null,
    };
  }

  getKeyEpoch(): number {
    return this.keyEpoch;
  }

  hasKey(): boolean {
    return Boolean(this.keyBytes && this.keyBytes.length > 0);
  }

  getCurrentKey(): Uint8Array | null {
    return this.keyBytes;
  }
}

type EncodedFrameLike = {
  data: ArrayBuffer;
};

function xorWithKey(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    out[i] = data[i] ^ key[i % key.length];
  }
  return out;
}

function encodeOrDecodeFrame(frame: EncodedFrameLike, keyStore: Phase1E2eeKeyStore): EncodedFrameLike {
  const key = keyStore.getCurrentKey();
  if (!key || key.length === 0) {
    return frame;
  }

  const bytes = new Uint8Array(frame.data);
  const transformed = xorWithKey(bytes, key);
  const normalized = new ArrayBuffer(transformed.byteLength);
  new Uint8Array(normalized).set(transformed);
  frame.data = normalized;
  return frame;
}

const attachedSenders = new WeakSet<RTCRtpSender>();
const attachedReceivers = new WeakSet<RTCRtpReceiver>();

function tryAttachTransformToSender(sender: RTCRtpSender, keyStore: Phase1E2eeKeyStore): boolean {
  if (attachedSenders.has(sender)) {
    return true;
  }

  const anySender = sender as unknown as {
    createEncodedStreams?: () => { readable: ReadableStream<EncodedFrameLike>; writable: WritableStream<EncodedFrameLike> };
  };

  if (typeof anySender.createEncodedStreams !== "function") {
    return false;
  }

  const streams = anySender.createEncodedStreams();
  const transform = new TransformStream<EncodedFrameLike, EncodedFrameLike>({
    transform(frame, controller) {
      controller.enqueue(encodeOrDecodeFrame(frame, keyStore));
    },
  });

  streams.readable
    .pipeThrough(transform)
    .pipeTo(streams.writable)
    .catch(() => undefined);

  attachedSenders.add(sender);
  return true;
}

function tryAttachTransformToReceiver(receiver: RTCRtpReceiver, keyStore: Phase1E2eeKeyStore): boolean {
  if (attachedReceivers.has(receiver)) {
    return true;
  }

  const anyReceiver = receiver as unknown as {
    createEncodedStreams?: () => { readable: ReadableStream<EncodedFrameLike>; writable: WritableStream<EncodedFrameLike> };
  };

  if (typeof anyReceiver.createEncodedStreams !== "function") {
    return false;
  }

  const streams = anyReceiver.createEncodedStreams();
  const transform = new TransformStream<EncodedFrameLike, EncodedFrameLike>({
    transform(frame, controller) {
      controller.enqueue(encodeOrDecodeFrame(frame, keyStore));
    },
  });

  streams.readable
    .pipeThrough(transform)
    .pipeTo(streams.writable)
    .catch(() => undefined);

  attachedReceivers.add(receiver);
  return true;
}

function findRtpSenderOnObject(value: unknown): RTCRtpSender | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const directCandidates = ["rtpSender", "sender", "_rtpSender"];

  for (const key of directCandidates) {
    const candidate = source[key];
    if (candidate && typeof RTCRtpSender !== "undefined" && candidate instanceof RTCRtpSender) {
      return candidate;
    }
  }

  // Common mediasoup-client internals can hold sender deeper in private fields.
  const nestedCandidates = ["_handler", "handler", "_transport", "transport", "_pc"];
  for (const key of nestedCandidates) {
    const nested = source[key];
    if (!nested || typeof nested !== "object") {
      continue;
    }

    const nestedRecord = nested as Record<string, unknown>;
    for (const nestedKey of Object.keys(nestedRecord)) {
      const candidate = nestedRecord[nestedKey];
      if (candidate && typeof RTCRtpSender !== "undefined" && candidate instanceof RTCRtpSender) {
        return candidate;
      }
    }
  }

  return null;
}

function findRtpReceiverOnObject(value: unknown): RTCRtpReceiver | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const directCandidates = ["rtpReceiver", "receiver", "_rtpReceiver"];

  for (const key of directCandidates) {
    const candidate = source[key];
    if (candidate && typeof RTCRtpReceiver !== "undefined" && candidate instanceof RTCRtpReceiver) {
      return candidate;
    }
  }

  const nestedCandidates = ["_handler", "handler", "_transport", "transport", "_pc"];
  for (const key of nestedCandidates) {
    const nested = source[key];
    if (!nested || typeof nested !== "object") {
      continue;
    }

    const nestedRecord = nested as Record<string, unknown>;
    for (const nestedKey of Object.keys(nestedRecord)) {
      const candidate = nestedRecord[nestedKey];
      if (candidate && typeof RTCRtpReceiver !== "undefined" && candidate instanceof RTCRtpReceiver) {
        return candidate;
      }
    }
  }

  return null;
}

export function attachPhase1E2eeToProducer(params: {
  producer: unknown;
  keyStore: Phase1E2eeKeyStore;
  flags: Phase1E2eeFlags;
}): boolean {
  if (!params.flags.enabled || typeof window === "undefined") {
    return false;
  }

  const sender = findRtpSenderOnObject(params.producer);
  if (!sender) {
    return false;
  }

  return tryAttachTransformToSender(sender, params.keyStore);
}

export function attachPhase1E2eeToConsumer(params: {
  consumer: unknown;
  keyStore: Phase1E2eeKeyStore;
  flags: Phase1E2eeFlags;
}): boolean {
  if (!params.flags.enabled || typeof window === "undefined") {
    return false;
  }

  const receiver = findRtpReceiverOnObject(params.consumer);
  if (!receiver) {
    return false;
  }

  return tryAttachTransformToReceiver(receiver, params.keyStore);
}
