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

function normalizeVersionTag(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned || "v1";
}

function versionEnvSuffix(version: string): string {
  return normalizeVersionTag(version).toUpperCase().replace(/[^A-Z0-9]/g, "_");
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

export function getCurrentSecureFileEncryptionVersion(): string {
  return normalizeVersionTag(process.env.SECURE_FILE_ENCRYPTION_KEY_VERSION || "v1");
}

export function getSecureFileEncryptionKeyByVersion(version: string): Buffer | null {
  const suffix = versionEnvSuffix(version);
  const versionedRaw = process.env[`SECURE_FILE_ENCRYPTION_KEY_${suffix}`];
  const fallbackRaw = process.env.SECURE_FILE_ENCRYPTION_KEY;
  const raw = versionedRaw || fallbackRaw || process.env.SECURE_MESSAGING_KEY;

  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    return normalizeKeyMaterial(raw);
  } catch {
    return null;
  }
}

export function getCurrentSecureFileEncryptionKey(): { version: string; key: Buffer } | null {
  const version = getCurrentSecureFileEncryptionVersion();
  const key = getSecureFileEncryptionKeyByVersion(version);
  if (!key) {
    return null;
  }

  return { version, key };
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

const SECURE_BINARY_MAGIC = Buffer.from("OCDMF1", "utf8");

export function encryptSecureBinary(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([SECURE_BINARY_MAGIC, iv, authTag, encrypted]);
}

export function isSecureBinaryEnvelope(payload: Buffer): boolean {
  if (payload.length < SECURE_BINARY_MAGIC.length + IV_LENGTH + 16) {
    return false;
  }

  return payload.subarray(0, SECURE_BINARY_MAGIC.length).equals(SECURE_BINARY_MAGIC);
}

export function decryptSecureBinary(payload: Buffer, key: Buffer): Buffer {
  if (!isSecureBinaryEnvelope(payload)) {
    throw new Error("Invalid secure binary payload envelope");
  }

  const ivStart = SECURE_BINARY_MAGIC.length;
  const ivEnd = ivStart + IV_LENGTH;
  const tagEnd = ivEnd + 16;

  const iv = payload.subarray(ivStart, ivEnd);
  const authTag = payload.subarray(ivEnd, tagEnd);
  const ciphertext = payload.subarray(tagEnd);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
