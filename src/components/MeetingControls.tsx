"use client";

import type { ReactionEmoji } from "@/src/types/socket";

type MeetingControlsProps = {
	isMicEnabled: boolean;
	isCameraEnabled: boolean;
	isScreenSharing: boolean;
	isBackgroundBlurEnabled: boolean;
	isNoiseSuppressionEnabled: boolean;
	isAvatarSpeakerModeEnabled: boolean;
	isRecording: boolean;
	isHandRaised: boolean;
	listenLanguage: string;
	listenLanguageOptions: Array<{ label: string; value: string }>;
	isVoiceTranslatorEnabled: boolean;
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onToggleScreenShare: () => void;
	onToggleBackgroundBlur: () => void;
	onToggleNoiseSuppression: () => void;
	onToggleAvatarSpeakerMode: () => void;
	onToggleRecording: () => void;
	onToggleHand: () => void;
	onChangeListenLanguage: (language: string) => void;
	onToggleVoiceTranslator: () => void;
	onSendReaction: (emoji: ReactionEmoji) => void;
	onLeave: () => void;
	// New feature props
	isLowBandwidthMode: boolean;
	onToggleLowBandwidth: () => void;
	isVoiceControlEnabled: boolean;
	lastVoiceCommand?: string | null;
	onToggleVoiceControl: () => void;
	isAutoFrameEnabled: boolean;
	onToggleAutoFrame: () => void;
};

function controlClass(active: boolean): string {
	return active
		? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
		: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]";
}

export function MeetingControls({
	isMicEnabled,
	isCameraEnabled,
	isScreenSharing,
	isBackgroundBlurEnabled,
	isNoiseSuppressionEnabled,
	isAvatarSpeakerModeEnabled,
	isRecording,
	isHandRaised,
	listenLanguage,
	listenLanguageOptions,
	isVoiceTranslatorEnabled,
	onToggleMic,
	onToggleCamera,
	onToggleScreenShare,
	onToggleBackgroundBlur,
	onToggleNoiseSuppression,
	onToggleAvatarSpeakerMode,
	onToggleRecording,
	onToggleHand,
	onChangeListenLanguage,
	onToggleVoiceTranslator,
	onSendReaction,
	onLeave,
	isLowBandwidthMode,
	onToggleLowBandwidth,
	isVoiceControlEnabled,
	lastVoiceCommand,
	onToggleVoiceControl,
	isAutoFrameEnabled,
	onToggleAutoFrame,
}: MeetingControlsProps) {
	const reactionButtons: ReactionEmoji[] = ["👍", "❤️", "👏", "😂"];
	const isOriginalLanguage = listenLanguage === "original";
	const listenLanguageLabel = isOriginalLanguage ? "Original audio" : `Hearing: ${listenLanguage}`;
	const hasMatchingLanguageOption = listenLanguageOptions.some((option) => option.value === listenLanguage);
	const currentListenLanguage = hasMatchingLanguageOption ? listenLanguage : "original";

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#d7e4f8] bg-white p-3 shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
			<div className="flex items-center gap-2 rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-3 py-2 text-sm text-[#1a73e8]">
				<span className="font-semibold">{listenLanguageLabel}</span>
				<select
					value={currentListenLanguage}
					onChange={(event) => onChangeListenLanguage(event.target.value)}
					className="rounded-md border border-[#c8daf8] bg-white px-2 py-1 text-xs text-[#1a73e8]"
					title="Choose hearing language"
				>
					{listenLanguageOptions.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				{!isOriginalLanguage && (
					<button
						type="button"
						onClick={onToggleVoiceTranslator}
						className={
							isVoiceTranslatorEnabled
								? "rounded-lg border border-[#1a73e8] bg-[#e9f2ff] px-2 py-1 text-xs font-semibold text-[#1a73e8]"
								: "rounded-lg border border-[#d7e4f8] bg-white px-2 py-1 text-xs font-semibold text-[#5f6368]"
						}
					>
						{isVoiceTranslatorEnabled ? "Voice On" : "Voice Off"}
					</button>
				)}
			</div>
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
						? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
						: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]"
				}
				onClick={onToggleScreenShare}
			>
				{isScreenSharing ? "Stop Share" : "Share Screen"}
			</button>
			<button
				type="button"
				className={
					isRecording
						? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
						: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]"
				}
				onClick={onToggleRecording}
			>
				{isRecording ? "Stop Recording" : "Record"}
			</button>
			<button
				type="button"
				className={
					isBackgroundBlurEnabled
						? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
						: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]"
				}
				onClick={onToggleBackgroundBlur}
			>
				{isBackgroundBlurEnabled ? "Blur Off" : "Blur On"}
			</button>
			<button
				type="button"
				className={
					isNoiseSuppressionEnabled
						? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
						: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]"
				}
				onClick={onToggleNoiseSuppression}
			>
				{isNoiseSuppressionEnabled ? "Noise Off" : "Noise On"}
			</button>
			<button
				type="button"
				className={
					isAvatarSpeakerModeEnabled
						? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
						: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]"
				}
				onClick={onToggleAvatarSpeakerMode}
			>
				{isAvatarSpeakerModeEnabled ? "Avatar Off" : "Avatar On"}
			</button>
			<button
				type="button"
				className={controlClass(isLowBandwidthMode)}
				onClick={onToggleLowBandwidth}
			>
				{isLowBandwidthMode ? "Low BW On" : "Low BW"}
			</button>
			<button
				type="button"
				className={controlClass(isVoiceControlEnabled)}
				onClick={onToggleVoiceControl}
				title={lastVoiceCommand ? `Last: "${lastVoiceCommand}"` : "Voice commands"}
			>
				{isVoiceControlEnabled ? "🎙️ Voice On" : "🎙️ Voice"}
			</button>
			<button
				type="button"
				className={controlClass(isAutoFrameEnabled)}
				onClick={onToggleAutoFrame}
			>
				{isAutoFrameEnabled ? "Frame On" : "Auto Frame"}
			</button>
			<button
				type="button"
				className={
					isHandRaised
						? "rounded-xl border border-[#1a73e8] bg-[#e9f2ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
						: "rounded-xl border border-[#d7e4f8] bg-white px-4 py-2 text-sm font-semibold text-[#5f6368]"
				}
				onClick={onToggleHand}
			>
				{isHandRaised ? "✋ Lower Hand" : "✋ Raise Hand"}
			</button>
			<div className="ml-2 flex items-center gap-1 rounded-xl border border-[#d7e4f8] bg-[#f7fbff] px-2 py-1">
				{reactionButtons.map((emoji) => (
					<button
						key={emoji}
						type="button"
						onClick={() => onSendReaction(emoji)}
						className="rounded-md px-2 py-1 text-base leading-none hover:bg-[#e9f2ff]"
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
