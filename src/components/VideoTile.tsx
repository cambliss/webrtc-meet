"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { Participant } from "@/src/types/meeting";

type VideoTileProps = {
	participant: Participant;
	stream: MediaStream | null;
	isLocal?: boolean;
	isHandRaised?: boolean;
	isRecording?: boolean;
	isActiveSpeaker?: boolean;
	avatarMode?: boolean;
	variant?: "default" | "large" | "thumbnail";
	userAvatarPath?: string | null;
	emotionEmoji?: string | null;
};

function getParticipantInitials(name: string): string {
	const parts = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2);

	if (parts.length === 0) {
		return "AI";
	}

	return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "AI";
}

function getAvatarGradient(name: string): string {
	const seed = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
	const hueA = seed % 360;
	const hueB = (seed * 1.7 + 80) % 360;
	return `linear-gradient(145deg, hsla(${hueA}, 78%, 60%, 0.95), hsla(${hueB}, 72%, 42%, 0.92))`;
}

export function VideoTile({
	participant,
	stream,
	isLocal = false,
	isHandRaised = false,
	isRecording = false,
	isActiveSpeaker = false,
	avatarMode = false,
	variant = "default",
	userAvatarPath = null,
	emotionEmoji = null,
}: VideoTileProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [avatarImageErrorKey, setAvatarImageErrorKey] = useState<string | null>(null);

	useEffect(() => {
		if (!videoRef.current || !stream) {
			return;
		}

		videoRef.current.srcObject = stream;
	}, [stream]);

	// Always play audio for remote participants regardless of camera/avatar state.
	useEffect(() => {
		if (isLocal || !audioRef.current || !stream) {
			return;
		}

		const audioEl = audioRef.current;
		audioEl.srcObject = stream;
		audioEl.muted = false;
		audioEl.volume = 1;

		// Some browsers block autoplay unless play() is explicitly requested.
		void audioEl.play().catch((error) => {
			console.warn("Remote audio autoplay was blocked", error);
		});
	}, [isLocal, stream]);

	const frameRadius = variant === "thumbnail" ? "rounded-2xl" : "rounded-[1.35rem]";
	const showAvatar = avatarMode || participant.isCameraOff || !stream;

	const articleClass =
		variant === "large"
			? `group relative flex h-full flex-col overflow-hidden ${frameRadius} border ${isActiveSpeaker ? "border-fuchsia-300/55" : "border-cyan-100/20"} bg-[#041428] shadow-[0_24px_60px_rgba(2,8,30,0.78)]`
			: variant === "thumbnail"
				? `group relative aspect-video overflow-hidden ${frameRadius} border ${isActiveSpeaker ? "border-fuchsia-300/55" : "border-cyan-100/20"} bg-[#041428] shadow-[0_20px_44px_rgba(2,8,30,0.72)]`
				: `group relative aspect-video overflow-hidden ${frameRadius} border ${isActiveSpeaker ? "border-fuchsia-300/55" : "border-cyan-100/20"} bg-[#041428] shadow-[0_20px_44px_rgba(2,8,30,0.72)]`;

	const videoClass =
		variant === "large"
			? "min-h-0 h-full w-full flex-1 bg-[#020a18] object-cover"
			: "h-full w-full bg-[#020a18] object-cover";
	const avatarInitials = getParticipantInitials(participant.username);
	const avatarGradient = getAvatarGradient(participant.username);
	const avatarImageKey = `${participant.userId}:${userAvatarPath ?? ""}:${participant.avatarVersion ?? ""}`;
	const hasAvatarImageError = avatarImageErrorKey === avatarImageKey;

	return (
		<article className={articleClass}>
			{isActiveSpeaker && (
				<div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-fuchsia-300/50 shadow-[0_0_0_1px_rgba(244,114,182,0.25),0_0_30px_rgba(217,70,239,0.24)]" />
			)}
			<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(180,238,255,0.18)_0%,rgba(7,16,42,0)_28%,rgba(72,218,255,0.14)_100%)]" />
			<div className="pointer-events-none absolute inset-[1px] bg-[radial-gradient(circle_at_12%_8%,rgba(255,255,255,0.22),rgba(255,255,255,0)_34%),radial-gradient(circle_at_88%_90%,rgba(34,211,238,0.16),rgba(34,211,238,0)_40%)]" />

			{isRecording && (
				<div className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-rose-200/55 bg-rose-500/25 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-rose-100 shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
					<span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
					REC
				</div>
			)}

			{isHandRaised && (
				<div className="absolute right-3 top-3 z-20 rounded-full border border-amber-200/70 bg-amber-300 px-2 py-0.5 text-base leading-none text-amber-950 shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
					✋
				</div>
			)}
			{emotionEmoji && (
				<div className="absolute left-3 top-3 z-20 rounded-full bg-black/40 px-2 py-0.5 text-base leading-none backdrop-blur-sm">
					{emotionEmoji}
				</div>
			)}
			{showAvatar ? (
				<div className="relative h-full w-full overflow-hidden bg-[#020a18]">
					<div className="absolute inset-0 opacity-90" style={{ background: avatarGradient }} />
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.3),transparent_36%),radial-gradient(circle_at_bottom,rgba(8,15,34,0.65),rgba(3,8,20,0.9))]" />
					
					{/* User avatar image if available */}
					{userAvatarPath && !hasAvatarImageError ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center">
							<Image
								src={`/api/auth/avatar/${encodeURIComponent(participant.userId)}${participant.avatarVersion ? `?v=${participant.avatarVersion}` : ""}`}
								alt={participant.username}
								fill
								unoptimized
								sizes={variant === "large" ? "100vw" : "33vw"}
								className={`object-cover ${variant === "large" ? "" : "max-h-96 max-w-96"}`}
								onError={() => setAvatarImageErrorKey(avatarImageKey)}
							/>
						</div>
					) : (
						/* Fallback to initials */
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
							<div className={`flex items-center justify-center rounded-full border border-white/35 bg-white/15 text-white shadow-[0_20px_48px_rgba(0,0,0,0.35)] backdrop-blur-md ${variant === "large" ? "h-32 w-32 text-4xl" : variant === "thumbnail" ? "h-16 w-16 text-lg" : "h-20 w-20 text-2xl"}`}>
								<span className="font-semibold tracking-[0.08em]">{avatarInitials}</span>
							</div>
							<div className="space-y-1">
								<p className={`font-semibold text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)] ${variant === "large" ? "text-xl" : "text-sm"}`}>
									{participant.username}
								</p>
								<p className="text-xs uppercase tracking-[0.18em] text-white/75">
									{isActiveSpeaker ? "Speaker Focus" : participant.isMuted ? "Listening" : "Avatar Live"}
								</p>
							</div>
							{!participant.isMuted && (
								<div className="flex items-end gap-1">
									{[0, 1, 2, 3, 4].map((index) => (
										<span
											key={index}
											className={`w-1.5 rounded-full bg-white/80 ${isActiveSpeaker ? "animate-pulse" : "opacity-70"}`}
											style={{
												height: `${16 + ((index % 3) + 1) * (isActiveSpeaker ? 10 : 5)}px`,
												animationDelay: `${index * 120}ms`,
											}}
										/>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			) : (
				<video
					ref={videoRef}
					autoPlay
					playsInline
					muted
					className={videoClass}
				/>
			)}

			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#010815] via-[#010815]/72 to-transparent" />

			<div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between p-3 text-xs text-slate-100">
				<span className="rounded-full border border-cyan-100/30 bg-[#071b35]/85 px-2.5 py-1 font-semibold tracking-[0.01em] text-cyan-50 shadow-[0_10px_22px_rgba(0,0,0,0.35)]">
					{participant.username} {participant.role === "host" ? "(Host)" : ""}
				</span>
				<div className="flex gap-2">
					{avatarMode && (
						<span className="rounded-full border border-fuchsia-300/45 bg-fuchsia-500/30 px-2 py-0.5 font-semibold text-fuchsia-100">
							Avatar
						</span>
					)}
					{isActiveSpeaker && (
						<span className="rounded-full border border-fuchsia-300/45 bg-fuchsia-500/30 px-2 py-0.5 font-semibold text-fuchsia-100">
							Speaking
						</span>
					)}
					{participant.isScreenSharing && (
						<span className="rounded-full border border-sky-300/45 bg-sky-500/30 px-2 py-0.5 font-semibold text-sky-100">
							Presenting
						</span>
					)}
					<span className={participant.isMuted ? "text-rose-300" : "text-emerald-300"}>
						{participant.isMuted ? "Muted" : "Mic"}
					</span>
					<span className={participant.isCameraOff ? "text-rose-300" : "text-cyan-300"}>
						{participant.isCameraOff ? "Cam Off" : "Cam"}
					</span>
				</div>
			</div>

			{/* Hidden audio element ensures remote audio plays even when camera is off / avatar mode is active */}
			{!isLocal && (
				<audio ref={audioRef} autoPlay playsInline className="hidden" />
			)}
		</article>
	);
}
