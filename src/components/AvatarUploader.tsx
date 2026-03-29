"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const CROPPED_AVATAR_SIZE = 512;

type CropDraft = {
  file: File;
  objectUrl: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildJpegFileName(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "").trim() || "avatar";
  return `${stem}.jpg`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load selected image"));
    image.src = url;
  });
}

async function createCroppedAvatarFile(draft: CropDraft): Promise<File> {
  const image = await loadImage(draft.objectUrl);
  const cropSide = Math.min(image.width, image.height) / draft.zoom;
  const maxOffsetX = Math.max(0, (image.width - cropSide) / 2);
  const maxOffsetY = Math.max(0, (image.height - cropSide) / 2);
  const cropX = clamp(image.width / 2 - cropSide / 2 + (draft.offsetX / 100) * maxOffsetX, 0, image.width - cropSide);
  const cropY = clamp(image.height / 2 - cropSide / 2 + (draft.offsetY / 100) * maxOffsetY, 0, image.height - cropSide);

  const canvas = document.createElement("canvas");
  canvas.width = CROPPED_AVATAR_SIZE;
  canvas.height = CROPPED_AVATAR_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to prepare image cropper");
  }

  context.drawImage(
    image,
    cropX,
    cropY,
    cropSide,
    cropSide,
    0,
    0,
    CROPPED_AVATAR_SIZE,
    CROPPED_AVATAR_SIZE,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Failed to crop selected image"));
        return;
      }

      resolve(value);
    }, "image/jpeg", 0.92);
  });

  return new File([blob], buildJpegFileName(draft.file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

type AvatarUploaderProps = {
  currentAvatarPath?: string | null;
  userId: string;
  onUploadSuccess?: (avatarPath: string) => void;
};

export function AvatarUploader({
  currentAvatarPath,
  userId,
  onUploadSuccess,
}: AvatarUploaderProps) {
  const [displayAvatarPath, setDisplayAvatarPath] = useState(currentAvatarPath ?? null);
  const [displayAvatarVersion, setDisplayAvatarVersion] = useState<number | null>(
    currentAvatarPath ? Date.now() : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayAvatarPath(currentAvatarPath ?? null);
    setDisplayAvatarVersion(currentAvatarPath ? Date.now() : null);
  }, [currentAvatarPath]);

  useEffect(() => {
    const objectUrl = cropDraft?.objectUrl;

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cropDraft?.objectUrl]);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearCropDraft = () => {
    setCropDraft((current) => {
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return null;
    });
  };

  const uploadAvatar = async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);

    const response = await fetch("/api/auth/avatar", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      avatarPath?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || "Failed to upload avatar");
    }

    setSuccess("Avatar uploaded successfully");
    setDisplayAvatarPath(data.avatarPath ?? null);
    setDisplayAvatarVersion(Date.now());
    if (data.avatarPath && onUploadSuccess) {
      onUploadSuccess(data.avatarPath);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    if (!file.type.startsWith("image/")) {
      setError("File must be an image");
      resetFileInput();
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError("File size must be less than 5MB");
      resetFileInput();
      return;
    }

    clearCropDraft();
    setCropDraft({
      file,
      objectUrl: URL.createObjectURL(file),
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
    resetFileInput();
  };

  const handleCropUpload = async () => {
    if (!cropDraft) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const croppedFile = await createCroppedAvatarFile(cropDraft);
      await uploadAvatar(croppedFile);
      clearCropDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!displayAvatarPath) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete avatar");
      }

      setSuccess("Avatar removed successfully");
      setDisplayAvatarPath(null);
      setDisplayAvatarVersion(Date.now());
      if (onUploadSuccess) {
        onUploadSuccess("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete avatar");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">Profile Avatar</h3>

      {/* Current avatar preview */}
      {displayAvatarPath && (
        <div className="mb-4 flex items-center gap-4">
          <div className="relative h-24 w-24 overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
            <Image
              src={`/api/auth/avatar/${encodeURIComponent(userId)}${displayAvatarVersion ? `?v=${displayAvatarVersion}` : ""}`}
              alt="Current avatar"
              width={96}
              height={96}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">Current avatar is set</p>
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Remove Avatar
            </button>
          </div>
        </div>
      )}

      {/* Upload form */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isLoading}
            className="flex-1 cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <p className="text-xs text-slate-500">
          Maximum file size: 5MB. Crop is applied before upload and saved as a square JPEG.
        </p>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
            {success}
          </div>
        )}
      </div>

      {cropDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">Crop avatar</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Adjust zoom and position, then upload a square 512 x 512 avatar.
                </p>
              </div>
              <button
                type="button"
                onClick={clearCropDraft}
                disabled={isLoading}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="flex items-center justify-center rounded-3xl bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_55%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-6">
                <div className="relative aspect-square w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                  <Image
                    src={cropDraft.objectUrl}
                    alt="Avatar crop preview"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 80vw, 360px"
                    className="object-cover"
                    style={{
                      transform: `translate(${cropDraft.offsetX / cropDraft.zoom}%, ${cropDraft.offsetY / cropDraft.zoom}%) scale(${cropDraft.zoom})`,
                      transformOrigin: "center",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-[2rem] border border-white/70" />
                </div>
              </div>

              <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Zoom</span>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={cropDraft.zoom}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current
                          ? { ...current, zoom: Number(event.target.value) }
                          : current,
                      )
                    }
                    className="w-full"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Horizontal position</span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropDraft.offsetX}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current
                          ? { ...current, offsetX: Number(event.target.value) }
                          : current,
                      )
                    }
                    className="w-full"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Vertical position</span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropDraft.offsetY}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current
                          ? { ...current, offsetY: Number(event.target.value) }
                          : current,
                      )
                    }
                    className="w-full"
                  />
                </label>

                <p className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                  Animated formats are flattened to a single cropped JPEG frame during upload.
                </p>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={clearCropDraft}
                    disabled={isLoading}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleCropUpload}
                    disabled={isLoading}
                    className="flex-1 rounded-xl border border-indigo-700 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isLoading ? "Uploading..." : "Crop and Upload"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
