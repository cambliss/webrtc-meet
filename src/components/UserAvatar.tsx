"use client";

import Image from "next/image";

type UserAvatarProps = {
  name: string;
  userId?: string | null;
  avatarPath?: string | null;
  avatarVersion?: number | null;
  size?: "sm" | "md";
  className?: string;
  textClassName?: string;
};

const SIZE_CLASS_MAP = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
} as const;

export function UserAvatar({
  name,
  userId,
  avatarPath,
  avatarVersion,
  size = "md",
  className = "",
  textClassName = "",
}: UserAvatarProps) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const sizeClasses = SIZE_CLASS_MAP[size];
  const imageSrc =
    avatarPath && userId
      ? `/api/auth/avatar/${encodeURIComponent(userId)}${avatarVersion ? `?v=${avatarVersion}` : ""}`
      : null;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-slate-600 bg-slate-700 ${sizeClasses} ${className}`.trim()}
    >
      <span
        className={`absolute inset-0 flex items-center justify-center font-semibold text-slate-200 ${textClassName}`.trim()}
      >
        {initials}
      </span>
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt={`${name} avatar`}
          width={size === "sm" ? 32 : 36}
          height={size === "sm" ? 32 : 36}
          className="relative z-10 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}
