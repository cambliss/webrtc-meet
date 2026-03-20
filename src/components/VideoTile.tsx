"use client";

import { useEffect, useRef } from "react";

import type { Participant } from "@/src/types/meeting";

type VideoTileProps = {
	participant: Participant;
	stream: MediaStream | null;
	isLocal?: boolean;
	isHandRaised?: boolean;
	isRecording?: boolean;
	variant?: "default" | "large" | "thumbnail";
};

export function VideoTile({
	participant,
	stream,
	isLocal = false,
	isHandRaised = false,
	isRecording = false,
	variant = "default",
}: VideoTileProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (!videoRef.current || !stream) {
			return;
		}

		videoRef.current.srcObject = stream;
	}, [stream]);

	const frameRadius = variant === "thumbnail" ? "rounded-2xl" : "rounded-[1.35rem]";

	const articleClass =
		variant === "large"
			? `group relative flex h-full flex-col overflow-hidden ${frameRadius} border border-cyan-100/20 bg-[#041428] shadow-[0_24px_60px_rgba(2,8,30,0.78)]`
			: variant === "thumbnail"
				? `group relative aspect-video overflow-hidden ${frameRadius} border border-cyan-100/20 bg-[#041428] shadow-[0_20px_44px_rgba(2,8,30,0.72)]`
				: `group relative aspect-video overflow-hidden ${frameRadius} border border-cyan-100/20 bg-[#041428] shadow-[0_20px_44px_rgba(2,8,30,0.72)]`;

	const videoClass =
		variant === "large"
			? "min-h-0 h-full w-full flex-1 bg-[#020a18] object-cover"
			: "h-full w-full bg-[#020a18] object-cover";

	return (
		<article className={articleClass}>
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
			<video
				ref={videoRef}
				autoPlay
				playsInline
				muted={isLocal}
				className={videoClass}
			/>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#010815] via-[#010815]/72 to-transparent" />

			<div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between p-3 text-xs text-slate-100">
				<span className="rounded-full border border-cyan-100/30 bg-[#071b35]/85 px-2.5 py-1 font-semibold tracking-[0.01em] text-cyan-50 shadow-[0_10px_22px_rgba(0,0,0,0.35)]">
					{participant.username} {participant.role === "host" ? "(Host)" : ""}
				</span>
				<div className="flex gap-2">
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
		</article>
	);
}
