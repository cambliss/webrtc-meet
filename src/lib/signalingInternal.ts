import {
  getSignalingInternalServiceAudience,
  signServiceToken,
} from "@/src/lib/serviceIdentity";

function resolveSignalingInternalBaseUrl(): string {
  return (
    process.env.SIGNALING_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_SIGNALING_URL ||
    "http://localhost:4000"
  ).replace(/\/$/, "");
}

export async function syncAvatarPresence(params: {
  userId: string;
  avatarPath: string | null;
  avatarVersion: number | null;
}): Promise<void> {
  const token = signServiceToken({
    service: "next-api",
    audience: getSignalingInternalServiceAudience(),
    scopes: ["internal:read", "internal:presence-write"],
    subject: `avatar-sync:${params.userId}`,
  });

  const response = await fetch(`${resolveSignalingInternalBaseUrl()}/internal/participants/avatar-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Avatar presence sync failed with status ${response.status}`);
  }
}