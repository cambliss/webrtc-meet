"use client";

import { useEffect, useState } from "react";

import { VideoTile } from "@/src/components/VideoTile";
import type { Participant, RemoteStream } from "@/src/types/meeting";

type VideoGridProps = {
	selfParticipant: Participant | null;
	localStream: MediaStream | null;
	remoteStreams: RemoteStream[];
	raisedHands?: string[];
	selfSocketId?: string;
	isRecording?: boolean;
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

	// Which sharer is shown in the spotlight.
	const [activePresenterId, setActivePresenterId] = useState<string | null>(null);

	// Auto-select: keep current if still sharing, else pick first sharer.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (sharerIds.length === 0) {
			setActivePresenterId(null);
			return;
		}
		setActivePresenterId((prev) =>
			prev && sharerIds.includes(prev) ? prev : sharerIds[0],
		);
	}, [sharerIds.join(",")]);

	// ── Regular grid (no screen sharing) ────────────────────────────────────
	if (!isPresenterMode) {
		if (allTiles.length === 1) {
			const tile = allTiles[0];
			return (
				<section className="h-full rounded-[1.6rem] border border-cyan-100/15 bg-[linear-gradient(160deg,rgba(3,15,32,0.96),rgba(3,22,46,0.92))] p-3 shadow-[0_26px_60px_rgba(1,6,20,0.78)]">
					<VideoTile
						participant={tile.participant}
						stream={tile.stream}
						isLocal={tile.isLocal}
						isHandRaised={tile.isHandRaised}
						isRecording={isRecording}
						variant="large"
					/>
				</section>
			);
		}

		return (
			<section className="grid grid-cols-1 content-start items-start gap-3 rounded-[1.6rem] border border-cyan-100/15 bg-[linear-gradient(160deg,rgba(3,15,32,0.96),rgba(3,22,46,0.92))] p-3 shadow-[0_26px_60px_rgba(1,6,20,0.78)] sm:grid-cols-2 xl:grid-cols-3">
				{allTiles.map((tile) => (
					<VideoTile
						key={tile.socketId}
						participant={tile.participant}
						stream={tile.stream}
						isLocal={tile.isLocal}
						isHandRaised={tile.isHandRaised}
						isRecording={isRecording}
					/>
				))}
			</section>
		);
	}

	// ── Presenter mode (screen sharing active) ───────────────────────────────
	const presenterTile =
		allTiles.find((t) => t.socketId === activePresenterId) ??
		allTiles.find((t) => t.participant.isScreenSharing)!;
	const thumbnailTiles = allTiles.filter((t) => t.socketId !== presenterTile.socketId);

	return (
		<div className="flex h-full flex-col gap-3 rounded-[1.6rem] border border-cyan-100/15 bg-[linear-gradient(160deg,rgba(3,15,32,0.96),rgba(3,22,46,0.92))] p-3 shadow-[0_26px_60px_rgba(1,6,20,0.78)]">
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
									sharer.socketId === activePresenterId
										? "rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-100"
										: "rounded-lg border border-slate-600/60 bg-slate-700/30 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-600/40"
								}
							>
								{sharer.participant.username}
								{sharer.socketId === activePresenterId ? " ✓" : ""}
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
						variant="large"
					/>
				</div>

				{/* Thumbnail strip — horizontal scroll on mobile, vertical on desktop */}
				{thumbnailTiles.length > 0 && (
					<div className="flex shrink-0 flex-row gap-2 overflow-x-auto rounded-2xl border border-cyan-100/10 bg-[#031226]/70 p-2 lg:w-44 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
						{thumbnailTiles.map((tile) => (
							<div key={tile.socketId} className="w-36 shrink-0 lg:w-full">
								<VideoTile
									participant={tile.participant}
									stream={tile.stream}
									isLocal={tile.isLocal}
									isHandRaised={tile.isHandRaised}
									isRecording={isRecording}
									variant="thumbnail"
								/>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
