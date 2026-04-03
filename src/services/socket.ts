import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || "";

function isLocalishHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }

  if (/^10\./.test(normalized)) {
    return true;
  }

  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) {
    return true;
  }

  return false;
}

function resolveSignalingUrl(): string {
  if (typeof window === "undefined") {
    return SIGNALING_URL || "http://localhost:4000";
  }

  const browserHostname = window.location.hostname;
  const browserProtocol = window.location.protocol;

  if (!SIGNALING_URL) {
    // Safe browser default: keep signaling on same origin as the web app.
    return window.location.origin;
  }

  try {
    const configured = new URL(SIGNALING_URL, window.location.origin);

    // In local/private dev, keep signaling on the same hostname as the web app
    // so httpOnly auth cookies are available during socket handshake.
    if (
      configured.hostname !== browserHostname &&
      isLocalishHostname(configured.hostname) &&
      isLocalishHostname(browserHostname)
    ) {
      configured.hostname = browserHostname;
    }

    return configured.toString();
  } catch {
    return `${browserProtocol}//${browserHostname}:4000`;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveSignalingUrl(), {
      autoConnect: false,
      path: "/socket.io/",
      // Start with polling for robust handshake through proxies, then upgrade to websocket.
      transports: ["polling", "websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2500,
      timeout: 10000,
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (!socket) {
    return;
  }

  socket.disconnect();
}
