import { promises as fs } from "node:fs";
import path from "node:path";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type ObjectStorageProvider = "local" | "s3";

type SharedFilePathParams = {
  workspaceId: string;
  storageName: string;
};

type RecordingPathParams = {
  storageName: string;
};

type DownloadResult =
  | {
      kind: "redirect";
      url: string;
    }
  | {
      kind: "buffer";
      bytes: Buffer;
      contentType: string;
      contentDisposition: string;
    };

let s3ClientSingleton: S3Client | null = null;

function getProvider(): ObjectStorageProvider {
  return String(process.env.OBJECT_STORAGE_PROVIDER || "local").toLowerCase() === "s3"
    ? "s3"
    : "local";
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function quoteFileName(value: string): string {
  return value.replace(/"/g, "");
}

function recordingsRoot(): string {
  return path.resolve(process.cwd(), process.env.RECORDINGS_DIR || "recordings");
}

function sharedFilesDir(workspaceId: string): string {
  return path.join(recordingsRoot(), "shared-files", sanitizeSegment(workspaceId));
}

function contentTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName || "").toLowerCase();
  switch (extension) {
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

function objectBucketRequired(): string {
  const bucket = process.env.OBJECT_STORAGE_S3_BUCKET;
  if (!bucket) {
    throw new Error("OBJECT_STORAGE_S3_BUCKET is required for s3 object storage");
  }
  return bucket;
}

function objectKeyPrefix(): string {
  const prefix = String(process.env.OBJECT_STORAGE_S3_KEY_PREFIX || "meetflow").trim();
  if (!prefix) {
    return "";
  }
  return prefix.replace(/^\/+|\/+$/g, "");
}

function withPrefix(key: string): string {
  const prefix = objectKeyPrefix();
  return prefix ? `${prefix}/${key}` : key;
}

function secureFileKey(params: SharedFilePathParams): string {
  return withPrefix(
    `shared-files/${sanitizeSegment(params.workspaceId)}/${path.basename(params.storageName)}`,
  );
}

function recordingKey(params: RecordingPathParams): string {
  return withPrefix(`recordings/${path.basename(params.storageName)}`);
}

function avatarKey(userId: string): string {
  return withPrefix(`avatars/${sanitizeSegment(userId)}`);
}

function getS3Client(): S3Client {
  if (s3ClientSingleton) {
    return s3ClientSingleton;
  }

  const region = process.env.OBJECT_STORAGE_S3_REGION || "us-east-1";
  const endpoint = process.env.OBJECT_STORAGE_S3_ENDPOINT || undefined;
  const forcePathStyle =
    String(process.env.OBJECT_STORAGE_S3_FORCE_PATH_STYLE || "false").toLowerCase() === "true";
  const accessKeyId = process.env.OBJECT_STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_S3_SECRET_ACCESS_KEY;

  s3ClientSingleton = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
  });

  return s3ClientSingleton;
}

function presignTtlSeconds(): number {
  return Math.min(Math.max(Number(process.env.OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS || "300"), 30), 3600);
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("Object storage body is empty");
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
    on?: (...args: unknown[]) => void;
  };

  if (typeof candidate.transformToByteArray === "function") {
    return Buffer.from(await candidate.transformToByteArray());
  }

  if (typeof candidate.arrayBuffer === "function") {
    return Buffer.from(await candidate.arrayBuffer());
  }

  if (typeof candidate.getReader === "function") {
    const reader = candidate.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  if (typeof candidate.on === "function") {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      (candidate as NodeJS.ReadableStream)
        .on("data", (chunk: Buffer | Uint8Array | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        })
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", reject);
    });
  }

  throw new Error("Unsupported object storage response body type");
}

export async function uploadSecureSharedFile(params: {
  workspaceId: string;
  storageName: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<void> {
  const provider = getProvider();

  if (provider === "s3") {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: objectBucketRequired(),
        Key: secureFileKey({ workspaceId: params.workspaceId, storageName: params.storageName }),
        Body: params.bytes,
        ContentType: params.mimeType || "application/octet-stream",
      }),
    );
    return;
  }

  const directory = sharedFilesDir(params.workspaceId);
  await fs.mkdir(directory, { recursive: true });
  const destinationPath = path.join(directory, path.basename(params.storageName));
  await fs.writeFile(destinationPath, params.bytes);
}

export async function deleteSecureSharedFile(params: SharedFilePathParams): Promise<void> {
  const provider = getProvider();

  if (provider === "s3") {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: objectBucketRequired(),
        Key: secureFileKey(params),
      }),
    );
    return;
  }

  const filePath = path.join(sharedFilesDir(params.workspaceId), path.basename(params.storageName));
  await fs.unlink(filePath).catch(() => {
    // Missing local file is tolerated to keep metadata source-of-truth.
  });
}

export async function resolveSecureSharedFileDownload(params: {
  workspaceId: string;
  storageName: string;
  originalName: string;
  mimeType: string;
  asDownload: boolean;
}): Promise<DownloadResult> {
  const provider = getProvider();
  const safeOriginalName = quoteFileName(params.originalName || "file.bin");
  const dispositionType = params.asDownload ? "attachment" : "inline";
  const contentType =
    params.mimeType && params.mimeType !== "application/octet-stream"
      ? params.mimeType
      : contentTypeFromFileName(params.originalName);
  const contentDisposition = `${dispositionType}; filename="${safeOriginalName}"`;

  if (provider === "s3") {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: objectBucketRequired(),
      Key: secureFileKey({ workspaceId: params.workspaceId, storageName: params.storageName }),
      ResponseContentType: contentType,
      ResponseContentDisposition: contentDisposition,
    });

    const url = await getSignedUrl(client, command, { expiresIn: presignTtlSeconds() });
    return { kind: "redirect", url };
  }

  const filePath = path.join(sharedFilesDir(params.workspaceId), path.basename(params.storageName));
  const bytes = await fs.readFile(filePath);
  return {
    kind: "buffer",
    bytes,
    contentType,
    contentDisposition,
  };
}

export async function readSecureSharedFileBytes(params: {
  workspaceId: string;
  storageName: string;
}): Promise<Buffer> {
  const provider = getProvider();

  if (provider === "s3") {
    const client = getS3Client();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: objectBucketRequired(),
        Key: secureFileKey({ workspaceId: params.workspaceId, storageName: params.storageName }),
      }),
    );

    return bodyToBuffer(response.Body);
  }

  const filePath = path.join(sharedFilesDir(params.workspaceId), path.basename(params.storageName));
  return fs.readFile(filePath);
}

export async function uploadMeetingRecording(params: {
  storageName: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<string> {
  const provider = getProvider();
  const normalized = path.basename(params.storageName);

  if (provider === "s3") {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: objectBucketRequired(),
        Key: recordingKey({ storageName: normalized }),
        Body: params.bytes,
        ContentType: params.mimeType || "video/webm",
      }),
    );

    return `s3:${normalized}`;
  }

  const root = recordingsRoot();
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, normalized), params.bytes);
  return normalized;
}

export async function resolveMeetingRecordingDownload(params: {
  storedPath: string;
  asDownload: boolean;
}): Promise<DownloadResult> {
  const provider = getProvider();
  const isS3Path = params.storedPath.startsWith("s3:");
  const fileName = path.basename(isS3Path ? params.storedPath.slice(3) : params.storedPath);
  const contentType = contentTypeFromFileName(fileName);
  const dispositionType = params.asDownload ? "attachment" : "inline";
  const contentDisposition = `${dispositionType}; filename="${quoteFileName(fileName)}"`;

  if (provider === "s3" || isS3Path) {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: objectBucketRequired(),
      Key: recordingKey({ storageName: fileName }),
      ResponseContentType: contentType,
      ResponseContentDisposition: contentDisposition,
    });
    const url = await getSignedUrl(client, command, { expiresIn: presignTtlSeconds() });
    return { kind: "redirect", url };
  }

  const root = recordingsRoot();
  const absolutePath = path.resolve(root, fileName);
  const normalizedRoot = (root + path.sep).toLowerCase();
  const normalizedFile = absolutePath.toLowerCase();
  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw new Error("Invalid recording path");
  }

  const bytes = await fs.readFile(absolutePath);
  return {
    kind: "buffer",
    bytes,
    contentType,
    contentDisposition,
  };
}

function avatarsDir(): string {
  return path.join(recordingsRoot(), "avatars");
}

export async function uploadUserAvatar(params: {
  userId: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<string> {
  const provider = getProvider();
  const fileName = `${sanitizeSegment(params.userId)}.jpg`;

  if (provider === "s3") {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: objectBucketRequired(),
        Key: avatarKey(params.userId),
        Body: params.bytes,
        ContentType: params.mimeType || "image/jpeg",
      }),
    );
    return `s3:${params.userId}`;
  }

  const directory = avatarsDir();
  await fs.mkdir(directory, { recursive: true });
  const destinationPath = path.join(directory, fileName);
  await fs.writeFile(destinationPath, params.bytes);
  return fileName;
}

export async function resolveUserAvatarDownload(params: {
  storedPath: string;
}): Promise<DownloadResult> {
  const provider = getProvider();
  const isS3Path = params.storedPath.startsWith("s3:");
  const userId = isS3Path ? params.storedPath.slice(3) : path.parse(params.storedPath).name;
  const contentType = "image/jpeg";
  const fileName = `${userId}-avatar.jpg`;
  const contentDisposition = `inline; filename="${quoteFileName(fileName)}"`;

  if (provider === "s3" || isS3Path) {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: objectBucketRequired(),
      Key: avatarKey(userId),
      ResponseContentType: contentType,
      ResponseContentDisposition: contentDisposition,
    });
    const url = await getSignedUrl(client, command, { expiresIn: presignTtlSeconds() });
    return { kind: "redirect", url };
  }

  const filePath = path.join(avatarsDir(), `${sanitizeSegment(userId)}.jpg`);
  try {
    const bytes = await fs.readFile(filePath);
    return {
      kind: "buffer",
      bytes,
      contentType,
      contentDisposition,
    };
  } catch {
    // Avatar file not found - return empty to trigger fallback
    return {
      kind: "buffer",
      bytes: Buffer.alloc(0),
      contentType,
      contentDisposition,
    };
  }
}

export async function deleteUserAvatar(userId: string): Promise<void> {
  const provider = getProvider();

  if (provider === "s3") {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: objectBucketRequired(),
        Key: avatarKey(userId),
      }),
    );
    return;
  }

  const filePath = path.join(avatarsDir(), `${sanitizeSegment(userId)}.jpg`);
  await fs.unlink(filePath).catch(() => {
    // Missing avatar is tolerated
  });
}

export function shouldUseS3ObjectStorage(): boolean {
  return getProvider() === "s3";
}
