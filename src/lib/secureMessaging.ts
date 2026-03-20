import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function normalizeKeyMaterial(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Secure messaging key is empty");
  }

  // Allow direct 32-byte key via base64/hex/plain text and normalize deterministically.
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Ignore decode failures and use hashed fallback.
  }

  return createHash("sha256").update(trimmed).digest();
}

export function getSecureMessagingKey(): Buffer | null {
  const raw = process.env.SECURE_MESSAGING_KEY;
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    return normalizeKeyMaterial(raw);
  } catch {
    return null;
  }
}

export function encryptSecureMessage(plaintext: string, key: Buffer) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertextB64: encrypted.toString("base64"),
    ivB64: iv.toString("base64"),
    authTagB64: authTag.toString("base64"),
  };
}

export function decryptSecureMessage(params: {
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  key: Buffer;
}): string {
  const decipher = createDecipheriv(ALGORITHM, params.key, Buffer.from(params.ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(params.authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(params.ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
