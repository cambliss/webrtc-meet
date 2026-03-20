import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { buildRateLimitKey, checkRateLimit } from "@/src/lib/rateLimit";
import {
  abandonIdempotentRequest,
  completeIdempotentRequest,
  startIdempotentRequest,
} from "@/src/lib/repositories/idempotencyRepository";
import {
  createWorkspaceSecureFile,
  listWorkspaceSecureFiles,
} from "@/src/lib/repositories/secureFileRepository";
import { uploadSecureSharedFile } from "@/src/lib/objectStorage";
import { getWorkspaceAccess } from "@/src/lib/workspaceRbac";

type SecureFilesRouteParams = {
  params: Promise<{ id: string }>;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeBaseName(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return cleaned || "shared-file";
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName || "").toLowerCase();
  if (!extension) {
    return ".bin";
  }

  return extension.replace(/[^a-z0-9.]/g, "") || ".bin";
}

type ScanVerdict = {
  clean: boolean;
  reason?: string;
};

function parseDelimitedSet(rawValue: string | undefined): Set<string> {
  if (!rawValue) {
    return new Set();
  }

  return new Set(
    rawValue
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function startsWithPrefixInSet(value: string, prefixes: Set<string>): boolean {
  if (!prefixes.size) {
    return true;
  }

  const normalized = value.toLowerCase();
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function bytesStartWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (buffer[index] !== signature[index]) {
      return false;
    }
  }

  return true;
}

function validateFileSignature(params: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): { ok: boolean; reason?: string } {
  const extension = safeExtension(params.fileName).toLowerCase();
  const mimeType = (params.mimeType || "application/octet-stream").toLowerCase();

  const strict = String(process.env.FILE_SIGNATURE_STRICT || "true").toLowerCase() === "true";
  const allowedExtensions = parseDelimitedSet(process.env.ALLOWED_UPLOAD_EXTENSIONS);
  const allowedMimePrefixes = parseDelimitedSet(
    process.env.ALLOWED_UPLOAD_MIME_PREFIXES || "image/,audio/,video/,text/,application/pdf,application/json,application/zip",
  );

  if (allowedExtensions.size && !allowedExtensions.has(extension)) {
    return { ok: false, reason: `File type ${extension} is not allowed` };
  }

  if (!startsWithPrefixInSet(mimeType, allowedMimePrefixes)) {
    return { ok: false, reason: `MIME type ${mimeType} is not allowed` };
  }

  // Block common executable signatures regardless of extension.
  if (
    bytesStartWith(params.bytes, [0x4d, 0x5a]) || // PE/EXE (MZ)
    bytesStartWith(params.bytes, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    bytesStartWith(params.bytes, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O
    bytesStartWith(params.bytes, [0xfe, 0xed, 0xfa, 0xce])
  ) {
    return { ok: false, reason: "Executable files are not allowed" };
  }

  if (!strict) {
    return { ok: true };
  }

  const signatureChecks: Record<string, () => boolean> = {
    ".png": () => bytesStartWith(params.bytes, [0x89, 0x50, 0x4e, 0x47]),
    ".jpg": () => bytesStartWith(params.bytes, [0xff, 0xd8, 0xff]),
    ".jpeg": () => bytesStartWith(params.bytes, [0xff, 0xd8, 0xff]),
    ".gif": () => bytesStartWith(params.bytes, [0x47, 0x49, 0x46, 0x38]),
    ".webp": () => bytesStartWith(params.bytes, [0x52, 0x49, 0x46, 0x46]),
    ".pdf": () => bytesStartWith(params.bytes, [0x25, 0x50, 0x44, 0x46]),
    ".zip": () => bytesStartWith(params.bytes, [0x50, 0x4b, 0x03, 0x04]),
    ".mp3": () => bytesStartWith(params.bytes, [0x49, 0x44, 0x33]) || bytesStartWith(params.bytes, [0xff, 0xfb]),
    ".wav": () => bytesStartWith(params.bytes, [0x52, 0x49, 0x46, 0x46]),
    ".webm": () => bytesStartWith(params.bytes, [0x1a, 0x45, 0xdf, 0xa3]),
    ".mp4": () => params.bytes.length > 8 && params.bytes[4] === 0x66 && params.bytes[5] === 0x74 && params.bytes[6] === 0x79 && params.bytes[7] === 0x70,
  };

  const checker = signatureChecks[extension];
  if (!checker) {
    return { ok: true };
  }

  if (!checker()) {
    return { ok: false, reason: "File signature does not match the extension" };
  }

  return { ok: true };
}

async function runOptionalMalwareScan(params: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ScanVerdict> {
  const webhookUrl = process.env.FILE_SCAN_WEBHOOK_URL;
  if (!webhookUrl) {
    return { clean: true };
  }

  const failClosed = String(process.env.FILE_SCAN_FAIL_CLOSED || "false").toLowerCase() === "true";
  const includeContent =
    String(process.env.FILE_SCAN_INCLUDE_CONTENT || "false").toLowerCase() === "true";

  try {
    const sha256 = createHash("sha256").update(params.bytes).digest("hex");
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: params.fileName,
        mimeType: params.mimeType,
        size: params.bytes.length,
        sha256,
        contentBase64: includeContent ? params.bytes.toString("base64") : undefined,
      }),
    });

    if (!response.ok) {
      if (failClosed) {
        return { clean: false, reason: "File scan service unavailable" };
      }
      return { clean: true };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      clean?: boolean;
      reason?: string;
    };

    if (payload.clean === false) {
      return { clean: false, reason: payload.reason || "File flagged by malware scan" };
    }

    return { clean: true };
  } catch {
    if (failClosed) {
      return { clean: false, reason: "File scan request failed" };
    }
    return { clean: true };
  }
}

export async function GET(request: Request, { params }: SecureFilesRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getWorkspaceAccess(id, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || "80");
  const files = await listWorkspaceSecureFiles(access.workspaceId, rawLimit);

  return NextResponse.json({
    workspaceId: access.workspaceId,
    files: files.map((file) => ({
      id: file.id,
      uploaderUserId: file.uploaderUserId,
      uploaderName: file.uploaderName,
      originalName: file.originalName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      createdAt: file.createdAt,
    })),
  });
}

export async function POST(request: Request, { params }: SecureFilesRouteParams) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getWorkspaceAccess(id, auth.userId);
  if (!access) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  if (idempotencyKey.length > 200) {
    return NextResponse.json({ error: "Idempotency-Key is too long" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Max file size is ${Math.floor(MAX_FILE_SIZE / (1024 * 1024))}MB` },
      { status: 400 },
    );
  }

  const safeName = safeBaseName(file.name);
  const ext = safeExtension(file.name);
  const storageName = `${randomUUID()}-${safeName}${ext}`;

  const bytes = await file.arrayBuffer();
  const fileBuffer = Buffer.from(bytes);

  const signature = validateFileSignature({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: fileBuffer,
  });

  if (!signature.ok) {
    return NextResponse.json(
      { error: signature.reason || "File signature validation failed" },
      { status: 400 },
    );
  }

  const uploadLimit = await checkRateLimit({
    scope: "secure-file-upload",
    key: buildRateLimitKey([access.workspaceId, auth.userId]),
    limit: Number(process.env.RATE_LIMIT_SECURE_FILES_UPLOAD_PER_10_MIN || "30"),
    windowMs: 10 * 60 * 1000,
  });

  if (!uploadLimit.allowed) {
    const response = NextResponse.json(
      { error: "Too many uploads. Please retry shortly." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(uploadLimit.retryAfterSeconds));
    return response;
  }

  const requestHash = createHash("sha256")
    .update(access.workspaceId)
    .update("|")
    .update(auth.userId)
    .update("|")
    .update(file.name)
    .update("|")
    .update(String(file.size))
    .update("|")
    .update(file.type || "application/octet-stream")
    .update("|")
    .update(fileBuffer)
    .digest("hex");

  const idempotencyScope = "secure-files-upload";
  const idempotencyActor = buildRateLimitKey([access.workspaceId, auth.userId]);

  if (idempotencyKey) {
    const started = await startIdempotentRequest({
      scope: idempotencyScope,
      actorKey: idempotencyActor,
      idempotencyKey,
      requestHash,
      ttlSeconds: Number(process.env.IDEMPOTENCY_TTL_SECONDS || "21600"),
    });

    if (started.state === "conflict") {
      return NextResponse.json(
        { error: "Idempotency-Key conflicts with a different request payload." },
        { status: 409 },
      );
    }

    if (started.state === "processing") {
      return NextResponse.json(
        { error: "Request with this Idempotency-Key is already processing." },
        { status: 409 },
      );
    }

    if (started.state === "replay") {
      return NextResponse.json(started.responseBody, { status: started.statusCode });
    }
  }

  try {
    const scan = await runOptionalMalwareScan({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: fileBuffer,
    });

    if (!scan.clean) {
      return NextResponse.json(
        { error: scan.reason || "File blocked by malware scanning policy" },
        { status: 400 },
      );
    }

    await uploadSecureSharedFile({
      workspaceId: access.workspaceId,
      storageName,
      bytes: fileBuffer,
      mimeType: file.type || "application/octet-stream",
    });

    const created = await createWorkspaceSecureFile({
      workspaceId: access.workspaceId,
      uploaderUserId: auth.userId,
      uploaderName: auth.username,
      originalName: file.name.slice(0, 255),
      storageName,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
    });

    const responseBody = {
      file: {
        id: created.id,
        uploaderUserId: created.uploaderUserId,
        uploaderName: created.uploaderName,
        originalName: created.originalName,
        fileSize: created.fileSize,
        mimeType: created.mimeType,
        createdAt: created.createdAt,
      },
    };

    if (idempotencyKey) {
      await completeIdempotentRequest({
        scope: idempotencyScope,
        actorKey: idempotencyActor,
        idempotencyKey,
        requestHash,
        statusCode: 201,
        responseBody,
      });
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    if (idempotencyKey) {
      await abandonIdempotentRequest({
        scope: idempotencyScope,
        actorKey: idempotencyActor,
        idempotencyKey,
        requestHash,
      });
    }

    throw error;
  }
}
