"use client";

import { useState } from "react";

import { VideoTile } from "@/src/components/VideoTile";
import type { Participant, RemoteStream } from "@/src/types/meeting";

type VideoGridProps = {
	selfParticipant: Participant | null;
	localStream: MediaStream | null;
	remoteStreams: RemoteStream[];
	raisedHands?: string[];
	selfSocketId?: string;
	isRecording?: boolean;
	activeSpeakerSocketId?: string | null;
	avatarSpeakerMode?: boolean;
	emotionBySocketId?: Record<string, string | null>;
};

type CanonicalTile = {
	socketId: string;
	participant: Participant;
	stream: MediaStream | null;
	isLocal: boolean;
	isHandRaised: boolean;
};

export function VideoGrid({
	selfParticipant,
	localStream,
	remoteStreams,
	raisedHands = [],
	selfSocketId,
	isRecording = false,
	activeSpeakerSocketId = null,
	avatarSpeakerMode = false,
	emotionBySocketId = {},
}: VideoGridProps) {
	// Build a single canonical list of all tiles.
	const allTiles: CanonicalTile[] = [
		...(selfParticipant
			? [
					{
						socketId: "local",
						participant: selfParticipant,
						stream: localStream,
						isLocal: true,
						isHandRaised: selfSocketId ? raisedHands.includes(selfSocketId) : false,
					},
				]
			: []),
		...remoteStreams.map((r) => ({
			socketId: r.participant.socketId,
			participant: r.participant,
			stream: r.stream,
			isLocal: false,
			isHandRaised: raisedHands.includes(r.participant.socketId),
		})),
	];

	// Participants currently sharing their screen.
	const sharerIds = allTiles
		.filter((t) => t.participant.isScreenSharing)
		.map((t) => t.socketId);

	const isPresenterMode = sharerIds.length > 0;
	const shouldUseSpeakerMode = avatarSpeakerMode && !isPresenterMode && allTiles.length > 1;

	// Which sharer is shown in the spotlight.
	const [activePresenterId, setActivePresenterId] = useState<string | null>(null);
	const resolvedPresenterId =
		activePresenterId && sharerIds.includes(activePresenterId) ? activePresenterId : sharerIds[0] ?? null;

	// ── Regular grid (no screen sharing) ────────────────────────────────────
	if (!isPresenterMode) {
		if (shouldUseSpeakerMode) {
			const spotlightTile =
				allTiles.find((tile) => tile.socketId === activeSpeakerSocketId) ??
				allTiles.find((tile) => !tile.participant.isMuted) ??
				allTiles[0];
			const secondaryTiles = allTiles.filter((tile) => tile.socketId !== spotlightTile.socketId);

			return (
				<div className="flex h-full flex-col gap-3 rounded-[1.6rem] border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-3 shadow-[0_20px_44px_rgba(26,115,232,0.14)]">
					<div className="flex items-center justify-between rounded-2xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-2 text-xs text-[#1a73e8]">
						<span className="font-semibold tracking-[0.16em] uppercase">AI Avatar Speaker Mode</span>
						<span>
							{spotlightTile.participant.username}
							{spotlightTile.socketId === activeSpeakerSocketId ? " is speaking" : " is highlighted"}
						</span>
					</div>
					<div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
						<div className="min-h-0 flex-1">
							<VideoTile
								participant={spotlightTile.participant}
								stream={spotlightTile.stream}
								isLocal={spotlightTile.isLocal}
								isHandRaised={spotlightTile.isHandRaised}
								isRecording={isRecording}
								isActiveSpeaker={spotlightTile.socketId === activeSpeakerSocketId}
								avatarMode
								variant="large"
								userAvatarPath={spotlightTile.participant.avatarPath}
							/>
						</div>
						{secondaryTiles.length > 0 && (
							<div className="flex shrink-0 flex-row gap-2 overflow-x-auto rounded-2xl border border-[#d7e4f8] bg-[#f8fbff] p-2 lg:w-52 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
								{secondaryTiles.map((tile) => (
									<div key={tile.socketId} className="w-36 shrink-0 lg:w-full">
										<VideoTile
											participant={tile.participant}
											stream={tile.stream}
											isLocal={tile.isLocal}
											isHandRaised={tile.isHandRaised}
											isRecording={isRecording}
											isActiveSpeaker={tile.socketId === activeSpeakerSocketId}
											avatarMode
											variant="thumbnail"
											userAvatarPath={tile.participant.avatarPath}
										/>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			);
		}

		if (allTiles.length === 1) {
			const tile = allTiles[0];
			return (
				<section className="h-full rounded-[1.6rem] border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-3 shadow-[0_20px_44px_rgba(26,115,232,0.14)]">
					<VideoTile
						participant={tile.participant}
						stream={tile.stream}
						isLocal={tile.isLocal}
						isHandRaised={tile.isHandRaised}
						isRecording={isRecording}
						isActiveSpeaker={tile.socketId === activeSpeakerSocketId}
						avatarMode={avatarSpeakerMode}
						variant="large"
						userAvatarPath={tile.participant.avatarPath}
						emotionEmoji={emotionBySocketId[tile.socketId] ?? null}
					/>
				</section>
			);
		}

		return (
			<section className="grid grid-cols-1 content-start items-start gap-3 rounded-[1.6rem] border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-3 shadow-[0_20px_44px_rgba(26,115,232,0.14)] sm:grid-cols-2 xl:grid-cols-3">
				{allTiles.map((tile) => (
					<VideoTile
						key={tile.socketId}
						participant={tile.participant}
						stream={tile.stream}
						isLocal={tile.isLocal}
						isHandRaised={tile.isHandRaised}
						isRecording={isRecording}
						isActiveSpeaker={tile.socketId === activeSpeakerSocketId}
						avatarMode={avatarSpeakerMode}
						userAvatarPath={tile.participant.avatarPath}
						emotionEmoji={emotionBySocketId[tile.socketId] ?? null}
					/>
				))}
			</section>
		);
	}

	// ── Presenter mode (screen sharing active) ───────────────────────────────
	const presenterTile =
		allTiles.find((t) => t.socketId === resolvedPresenterId) ??
		allTiles.find((t) => t.participant.isScreenSharing)!;
	const thumbnailTiles = allTiles.filter((t) => t.socketId !== presenterTile.socketId);

	return (
		<div className="flex h-full flex-col gap-3 rounded-[1.6rem] border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f6faff_100%)] p-3 shadow-[0_20px_44px_rgba(26,115,232,0.14)]">
			{/* Presenter switcher — visible only when multiple people share */}
			{sharerIds.length > 1 && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-cyan-100/80">Viewing:</span>
					{allTiles
						.filter((t) => t.participant.isScreenSharing)
						.map((sharer) => (
							<button
								key={sharer.socketId}
								type="button"
								onClick={() => setActivePresenterId(sharer.socketId)}
								className={
									sharer.socketId === resolvedPresenterId
										? "rounded-lg border border-[#1a73e8] bg-[#e9f2ff] px-3 py-1 text-xs font-semibold text-[#1a73e8]"
										: "rounded-lg border border-[#d7e4f8] bg-white px-3 py-1 text-xs font-semibold text-[#5f6368] hover:bg-[#f2f7ff]"
								}
							>
								{sharer.participant.username}
								{sharer.socketId === resolvedPresenterId ? " ✓" : ""}
							</button>
						))}
				</div>
			)}

			{/* Main area + thumbnail sidebar */}
			<div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
				{/* Large presenter tile */}
				<div className="min-h-0 flex-1">
					<VideoTile
						participant={presenterTile.participant}
						stream={presenterTile.stream}
						isLocal={presenterTile.isLocal}
						isHandRaised={presenterTile.isHandRaised}
						isRecording={isRecording}
						isActiveSpeaker={presenterTile.socketId === activeSpeakerSocketId}
						avatarMode={avatarSpeakerMode}
						variant="large"
						userAvatarPath={presenterTile.participant.avatarPath}
						emotionEmoji={emotionBySocketId[presenterTile.socketId] ?? null}
					/>
				</div>
				{thumbnailTiles.length > 0 && (
					<div className="flex shrink-0 flex-row gap-2 overflow-x-auto rounded-2xl border border-[#d7e4f8] bg-[#f8fbff] p-2 lg:w-52 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
						{thumbnailTiles.map((tile) => (
							<div key={tile.socketId} className="w-36 shrink-0 lg:w-full">
								<VideoTile
									participant={tile.participant}
									stream={tile.stream}
									isLocal={tile.isLocal}
									isHandRaised={tile.isHandRaised}
									isRecording={isRecording}
									isActiveSpeaker={tile.socketId === activeSpeakerSocketId}
									avatarMode={avatarSpeakerMode}
									variant="thumbnail"
									userAvatarPath={tile.participant.avatarPath}
									emotionEmoji={emotionBySocketId[tile.socketId] ?? null}
								/>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
