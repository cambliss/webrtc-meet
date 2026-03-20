import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { GuestMeetingEntry } from "@/src/components/GuestMeetingEntry";
import { MeetingRoom } from "@/src/components/MeetingRoom";
import { verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";

type MeetingPageProps = {
	params: Promise<{ id: string }>;
	searchParams?: Promise<{ invite?: string }>;
};

export default async function MeetingPage({ params, searchParams }: MeetingPageProps) {
	const { id } = await params;
	const resolvedSearchParams = searchParams ? await searchParams : {};
	const inviteToken = resolvedSearchParams.invite?.trim() || null;
	const requestedMeetingId = id?.trim();

	if (!requestedMeetingId) {
		redirect("/");
	}

	const pool = getDbPool();
	const canonicalMeetingResult = await pool.query<{ room_id: string }>(
		`
		SELECT room_id
		FROM meetings
		WHERE id::text = $1 OR room_id = $1
		LIMIT 1
		`,
		[requestedMeetingId],
	);

	const roomId = canonicalMeetingResult.rows[0]?.room_id?.trim();
	if (!roomId) {
		redirect("/");
	}

	const token = (await cookies()).get("meeting_token")?.value;
	const auth = token ? verifyAuthToken(token) : null;

	if (!auth) {
		const meetingResult = await pool.query<{ workspace_id: string }>(
			`
			SELECT workspace_id
			FROM meetings
			WHERE id::text = $1 OR room_id = $1
			LIMIT 1
			`,
			[roomId],
		);

		const workspaceId = meetingResult.rows[0]?.workspace_id;
		if (!workspaceId) {
			redirect("/");
		}

		return <GuestMeetingEntry roomId={roomId} workspaceId={workspaceId} inviteToken={inviteToken} />;
	}

	const joinResult = await pool.query<{ can_join: boolean; workspace_id: string }>(
		`
		SELECT
		  m.workspace_id,
		  EXISTS (
		    SELECT 1
		    FROM workspace_members wm
		    WHERE wm.workspace_id = m.workspace_id
		      AND wm.user_id = $1
		  )
		  OR EXISTS (
		    SELECT 1
		    FROM workspaces w
		    WHERE w.id = m.workspace_id
		      AND w.owner_id = $1
		  ) AS can_join
		FROM meetings m
		WHERE m.id::text = $2 OR m.room_id = $2
		LIMIT 1
		`,
		[auth.userId, roomId],
	);

	const joinRow = joinResult.rows[0];
	if (!joinRow) {
		redirect("/");
	}

	if (!joinRow.can_join) {
		return (
			<GuestMeetingEntry
				roomId={roomId}
				workspaceId={joinRow.workspace_id}
				defaultName={auth.username}
				inviteToken={inviteToken}
			/>
		);
	}

	return (
		<MeetingRoom
			roomId={roomId}
			inviteToken={inviteToken}
			me={{
				id: auth.userId,
				username: auth.username,
				role: auth.role,
				workspaceId: auth.workspaceId,
			}}
		/>
	);
}
