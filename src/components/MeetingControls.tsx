"use client";

import type { ReactionEmoji } from "@/src/types/socket";

type MeetingControlsProps = {
	isMicEnabled: boolean;
	isCameraEnabled: boolean;
	isScreenSharing: boolean;
	isBackgroundBlurEnabled: boolean;
	isRecording: boolean;
	isHandRaised: boolean;
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onToggleScreenShare: () => void;
	onToggleBackgroundBlur: () => void;
	onToggleRecording: () => void;
	onToggleHand: () => void;
	onSendReaction: (emoji: ReactionEmoji) => void;
	onLeave: () => void;
};

function controlClass(active: boolean): string {
	return active
		? "rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100"
		: "rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100";
}

export function MeetingControls({
	isMicEnabled,
	isCameraEnabled,
	isScreenSharing,
	isBackgroundBlurEnabled,
	isRecording,
	isHandRaised,
	onToggleMic,
	onToggleCamera,
	onToggleScreenShare,
	onToggleBackgroundBlur,
	onToggleRecording,
	onToggleHand,
	onSendReaction,
	onLeave,
}: MeetingControlsProps) {
	const reactionButtons: ReactionEmoji[] = ["👍", "❤️", "👏", "😂"];

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/80 p-3 backdrop-blur-sm">
			<button type="button" className={controlClass(isMicEnabled)} onClick={onToggleMic}>
				{isMicEnabled ? "Mute" : "Unmute"}
			</button>
			<button type="button" className={controlClass(isCameraEnabled)} onClick={onToggleCamera}>
				{isCameraEnabled ? "Camera Off" : "Camera On"}
			</button>
			<button
				type="button"
				className={
					isScreenSharing
						? "rounded-xl border border-amber-300/50 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100"
						: "rounded-xl border border-slate-500/60 bg-slate-700/30 px-4 py-2 text-sm font-semibold text-slate-100"
				}
				onClick={onToggleScreenShare}
			>
				{isScreenSharing ? "Stop Share" : "Share Screen"}
			</button>
			<button
				type="button"
				className={
					isRecording
						? "rounded-xl border border-rose-300/50 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100"
						: "rounded-xl border border-slate-500/60 bg-slate-700/30 px-4 py-2 text-sm font-semibold text-slate-100"
				}
				onClick={onToggleRecording}
			>
				{isRecording ? "Stop Recording" : "Record"}
			</button>
			<button
				type="button"
				className={
					isBackgroundBlurEnabled
						? "rounded-xl border border-cyan-300/50 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100"
						: "rounded-xl border border-slate-500/60 bg-slate-700/30 px-4 py-2 text-sm font-semibold text-slate-100"
				}
				onClick={onToggleBackgroundBlur}
			>
				{isBackgroundBlurEnabled ? "Blur Off" : "Blur On"}
			</button>
			<button
				type="button"
				className={
					isHandRaised
						? "rounded-xl border border-amber-300/50 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100"
						: "rounded-xl border border-slate-500/60 bg-slate-700/30 px-4 py-2 text-sm font-semibold text-slate-100"
				}
				onClick={onToggleHand}
			>
				{isHandRaised ? "✋ Lower Hand" : "✋ Raise Hand"}
			</button>
			<div className="ml-2 flex items-center gap-1 rounded-xl border border-slate-600/60 bg-slate-800/40 px-2 py-1">
				{reactionButtons.map((emoji) => (
					<button
						key={emoji}
						type="button"
						onClick={() => onSendReaction(emoji)}
						className="rounded-md px-2 py-1 text-base leading-none hover:bg-slate-700/70"
						aria-label={`Send ${emoji} reaction`}
					>
						{emoji}
					</button>
				))}
			</div>
			<button
				type="button"
				className="ml-auto rounded-xl border border-rose-500/50 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-100"
				onClick={onLeave}
			>
				Leave
			</button>
		</div>
	);
}
