export function getIceServers(): RTCIceServer[] {
  const stunUrl = process.env.NEXT_PUBLIC_STUN_URL || "stun:stun.l.google.com:19302";
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const iceServers: RTCIceServer[] = [{ urls: stunUrl }];

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return iceServers;
}
