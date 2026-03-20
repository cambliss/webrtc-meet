import { randomUUID } from "node:crypto";

import { getDbPool } from "@/src/lib/db";
import type { MeetingSummaryResult } from "@/src/types/ai";
import type { ChatMessage, MeetingFileShare, TranscriptLine } from "@/src/types/meeting";

export type MeetingHistoryItem = {
  meetingId: string;
  roomId: string;
  endedAt: string | null;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  createdAt: string;
  transcriptCount: number;
  hasRecording: boolean;
};

export type MeetingHistoryDetail = {
  meetingId: string;
  roomId: string;
  endedAt: string | null;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  createdAt: string;
  transcripts: Array<{
    id: string;
    speakerName: string;
    text: string;
    isFinal: boolean;
    createdAt: string;
  }>;
  chatMessages: Array<{
    id: string;
    senderName: string;
    message: string;
    sentAt: string;
  }>;
  sharedFiles: Array<{
    id: string;
    senderName: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    sharedAt: string;
  }>;
  recordingPath: string | null;
};

export type MeetingAnalytics = {
  meetingId: string;
  roomId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  participantCount: number;
  speakingTime: Array<{
    speakerName: string;
    seconds: number;
    percentOfTotal: number;
  }>;
  chatActivity: {
    totalMessages: number;
    messagesPerParticipant: Array<{
      senderName: string;
      count: number;
    }>;
  };
};

export type WorkspaceAnalyticsOverview = {
  totals: {
    meetings: number;
    totalDurationSeconds: number;
    averageParticipants: number;
    averageChatMessages: number;
  };
  recentMeetings: Array<{
    meetingId: string;
    roomId: string;
    endedAt: string | null;
    durationSeconds: number;
    participantCount: number;
    chatMessages: number;
  }>;
  trend: Array<{
    date: string;
    meetings: number;
    chatMessages: number;
  }>;
  topSpeakers: Array<{
    speakerName: string;
    turns: number;
  }>;
};

export type MeetingTaskStatus = "open" | "in_progress" | "done" | "canceled";

export type MeetingTask = {
  id: string;
  meetingId: string;
  title: string;
  assigneeName: string | null;
  dueDate: string | null;
  status: MeetingTaskStatus;
  confidence: number;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchMeetingHit = {
  meetingId: string;
  roomId: string;
  endedAt: string | null;
  rank: number;
  snippet: string;
};

function estimateSpeakingTime(lines: Array<{ speakerName: string; createdAt: string }>) {
  if (lines.length === 0) {
    return [] as Array<{ speakerName: string; seconds: number; percentOfTotal: number }>;
  }

  const sorted = [...lines].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const totals = new Map<string, number>();

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];

    const currentMs = new Date(current.createdAt).getTime();
    const nextMs = next ? new Date(next.createdAt).getTime() : currentMs + 5_000;
    const rawSeconds = Math.max(1, Math.round((nextMs - currentMs) / 1000));
    const contributionSeconds = Math.min(15, rawSeconds);

    totals.set(current.speakerName, (totals.get(current.speakerName) || 0) + contributionSeconds);
  }

  const totalSeconds = Array.from(totals.values()).reduce((acc, value) => acc + value, 0) || 1;

  return Array.from(totals.entries())
    .map(([speakerName, seconds]) => ({
      speakerName,
      seconds,
      percentOfTotal: Math.round((seconds / totalSeconds) * 100),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

export async function saveMeetingSummary(params: {
  workspaceId: string;
  roomId: string;
  summary: MeetingSummaryResult;
  transcriptLines?: TranscriptLine[];
  chatMessages?: ChatMessage[];
  fileShares?: MeetingFileShare[];
  recordingPath?: string | null;
  hostUserId?: string | null;
}): Promise<string> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY,
        meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        sender_id TEXT,
        sender_name TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    );

    await client.query(
      `
      CREATE INDEX IF NOT EXISTS idx_chat_messages_meeting_id_sent_at
      ON chat_messages(meeting_id, sent_at)
      `,
    );

    await client.query(
      `
      CREATE TABLE IF NOT EXISTS meeting_files (
        id UUID PRIMARY KEY,
        meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        sender_id TEXT,
        sender_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type TEXT NOT NULL,
        shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    );

    await client.query(
      `
      CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting_id_shared_at
      ON meeting_files(meeting_id, shared_at)
      `,
    );

    const meetingId = randomUUID();
    const fallbackTitle = `Meeting ${params.roomId}`;
    const meetingResult = await client.query<{ id: string }>(
      `
      INSERT INTO meetings (id, room_id, workspace_id, host_id, host_user_id, title, status, ended_at, recording_path)
      VALUES ($1, $2, $3, $4, $5, $6, 'ended', NOW(), $7)
      ON CONFLICT (room_id)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        host_id = COALESCE(EXCLUDED.host_id, meetings.host_id),
        host_user_id = COALESCE(EXCLUDED.host_user_id, meetings.host_user_id),
        title = COALESCE(meetings.title, EXCLUDED.title),
        status = 'ended',
        ended_at = NOW(),
        recording_path = COALESCE(EXCLUDED.recording_path, meetings.recording_path)
      RETURNING id
      `,
      [
        meetingId,
        params.roomId,
        params.workspaceId,
        params.hostUserId || null,
        params.hostUserId || null,
        fallbackTitle,
        params.recordingPath || null,
      ],
    );

    const resolvedMeetingId = meetingResult.rows[0]?.id;
    if (!resolvedMeetingId) {
      throw new Error("Failed to resolve meeting row");
    }

    await client.query(
      `
      INSERT INTO meeting_summaries (id, meeting_id, summary, key_points, action_items, created_at)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
      `,
      [
        randomUUID(),
        resolvedMeetingId,
        params.summary.summary,
        JSON.stringify(params.summary.keyPoints),
        JSON.stringify(params.summary.actionItems),
      ],
    );

    if (params.transcriptLines && params.transcriptLines.length > 0) {
      await client.query(
        `
        DELETE FROM transcripts
        WHERE meeting_id = $1
        `,
        [resolvedMeetingId],
      );

      for (const line of params.transcriptLines) {
        await client.query(
          `
          INSERT INTO transcripts (id, meeting_id, socket_id, speaker_name, text, is_final, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
          `,
          [
            line.id || randomUUID(),
            resolvedMeetingId,
            line.socketId || null,
            line.speakerName,
            line.text,
            line.isFinal,
            line.createdAt,
          ],
        );
      }
    }

    if (params.chatMessages && params.chatMessages.length > 0) {
      await client.query(
        `
        DELETE FROM chat_messages
        WHERE meeting_id = $1
        `,
        [resolvedMeetingId],
      );

      for (const message of params.chatMessages) {
        await client.query(
          `
          INSERT INTO chat_messages (id, meeting_id, sender_id, sender_name, message, sent_at)
          VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
          `,
          [
            randomUUID(),
            resolvedMeetingId,
            message.senderId || null,
            message.senderName,
            message.message,
            message.sentAt,
          ],
        );
      }
    }

    if (params.fileShares && params.fileShares.length > 0) {
      await client.query(
        `
        DELETE FROM meeting_files
        WHERE meeting_id = $1
        `,
        [resolvedMeetingId],
      );

      for (const file of params.fileShares) {
        await client.query(
          `
          INSERT INTO meeting_files (id, meeting_id, sender_id, sender_name, file_name, file_size, mime_type, shared_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
          `,
          [
            file.id || randomUUID(),
            resolvedMeetingId,
            file.senderId || null,
            file.senderName,
            file.fileName,
            file.fileSize,
            file.mimeType,
            file.sharedAt,
          ],
        );
      }
    }

    await client.query("COMMIT");
    return resolvedMeetingId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureMeetingIntelligenceSchema(): Promise<void> {
  const pool = getDbPool();

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS meeting_tasks (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assignee_name TEXT,
      due_date DATE,
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'canceled')),
      confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5,
      source_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
  );

  await pool.query(
    `
    CREATE INDEX IF NOT EXISTS idx_meeting_tasks_workspace_meeting
    ON meeting_tasks(workspace_id, meeting_id, created_at DESC)
    `,
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS meeting_search_documents (
      meeting_id UUID PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
  );

  await pool.query(
    `
    CREATE INDEX IF NOT EXISTS idx_meeting_search_documents_workspace
    ON meeting_search_documents(workspace_id, updated_at DESC)
    `,
  );

  await pool.query(
    `
    CREATE INDEX IF NOT EXISTS idx_meeting_search_documents_tsv
    ON meeting_search_documents
    USING GIN (to_tsvector('english', content))
    `,
  );
}

export async function replaceMeetingTasks(params: {
  workspaceId: string;
  meetingId: string;
  tasks: Array<{
    title: string;
    assigneeName: string | null;
    dueDate: string | null;
    confidence: number;
    sourceText: string;
  }>;
}): Promise<void> {
  await ensureMeetingIntelligenceSchema();
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM meeting_tasks
      WHERE workspace_id = $1
        AND meeting_id = $2
      `,
      [params.workspaceId, params.meetingId],
    );

    for (const task of params.tasks.slice(0, 50)) {
      await client.query(
        `
        INSERT INTO meeting_tasks (
          id, meeting_id, workspace_id, title, assignee_name, due_date,
          status, confidence, source_text, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, NOW(), NOW())
        `,
        [
          randomUUID(),
          params.meetingId,
          params.workspaceId,
          task.title,
          task.assigneeName,
          task.dueDate,
          Math.min(1, Math.max(0, task.confidence)),
          task.sourceText,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listMeetingTasks(
  workspaceId: string,
  meetingIdOrRoomId: string,
): Promise<MeetingTask[]> {
  await ensureMeetingIntelligenceSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    meeting_id: string;
    title: string;
    assignee_name: string | null;
    due_date: string | null;
    status: MeetingTaskStatus;
    confidence: string;
    source_text: string;
    created_at: string;
    updated_at: string;
  }>(
    `
    SELECT
      t.id,
      t.meeting_id::text,
      t.title,
      t.assignee_name,
      t.due_date::text,
      t.status,
      t.confidence::text,
      t.source_text,
      t.created_at,
      t.updated_at
    FROM meeting_tasks t
    INNER JOIN meetings m ON m.id = t.meeting_id
    WHERE t.workspace_id = $1
      AND (m.id::text = $2 OR m.room_id = $2)
    ORDER BY COALESCE(t.due_date, DATE '9999-12-31') ASC, t.created_at ASC
    `,
    [workspaceId, meetingIdOrRoomId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    assigneeName: row.assignee_name,
    dueDate: row.due_date,
    status: row.status,
    confidence: Number(row.confidence || 0.5),
    sourceText: row.source_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateMeetingTask(params: {
  workspaceId: string;
  meetingIdOrRoomId: string;
  taskId: string;
  patch: {
    title?: string;
    assigneeName?: string | null;
    dueDate?: string | null;
    status?: MeetingTaskStatus;
  };
}): Promise<MeetingTask | null> {
  await ensureMeetingIntelligenceSchema();
  const pool = getDbPool();

  const fields: string[] = [];
  const values: Array<string | null> = [];

  if (typeof params.patch.title === "string") {
    fields.push(`title = $${fields.length + 1}`);
    values.push(params.patch.title.trim());
  }
  if ("assigneeName" in params.patch) {
    fields.push(`assignee_name = $${fields.length + 1}`);
    values.push(params.patch.assigneeName || null);
  }
  if ("dueDate" in params.patch) {
    fields.push(`due_date = $${fields.length + 1}`);
    values.push(params.patch.dueDate || null);
  }
  if (params.patch.status) {
    fields.push(`status = $${fields.length + 1}`);
    values.push(params.patch.status);
  }

  if (fields.length === 0) {
    return null;
  }

  const result = await pool.query<{
    id: string;
    meeting_id: string;
    title: string;
    assignee_name: string | null;
    due_date: string | null;
    status: MeetingTaskStatus;
    confidence: string;
    source_text: string;
    created_at: string;
    updated_at: string;
  }>(
    `
    UPDATE meeting_tasks AS t
    SET
      ${fields.join(", ")},
      updated_at = NOW()
    FROM meetings m
    WHERE t.id = $${fields.length + 1}
      AND t.workspace_id = $${fields.length + 2}
      AND t.meeting_id = m.id
      AND (m.id::text = $${fields.length + 3} OR m.room_id = $${fields.length + 3})
    RETURNING
      t.id,
      t.meeting_id::text,
      t.title,
      t.assignee_name,
      t.due_date::text,
      t.status,
      t.confidence::text,
      t.source_text,
      t.created_at,
      t.updated_at
    `,
    [...values, params.taskId, params.workspaceId, params.meetingIdOrRoomId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    assigneeName: row.assignee_name,
    dueDate: row.due_date,
    status: row.status,
    confidence: Number(row.confidence || 0.5),
    sourceText: row.source_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertMeetingSearchDocument(params: {
  workspaceId: string;
  meetingId: string;
  roomId: string;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  transcriptLines: Array<{ speakerName: string; text: string }>;
}): Promise<void> {
  await ensureMeetingIntelligenceSchema();
  const pool = getDbPool();

  const transcriptText = params.transcriptLines
    .slice(0, 800)
    .map((line) => `${line.speakerName}: ${line.text}`)
    .join("\n");

  const content = [
    params.summary,
    params.keyPoints.join("\n"),
    params.actionItems.join("\n"),
    transcriptText,
  ]
    .filter(Boolean)
    .join("\n\n");

  await pool.query(
    `
    INSERT INTO meeting_search_documents (meeting_id, workspace_id, room_id, content, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (meeting_id)
    DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      room_id = EXCLUDED.room_id,
      content = EXCLUDED.content,
      updated_at = NOW()
    `,
    [params.meetingId, params.workspaceId, params.roomId, content],
  );
}

export async function searchMeetingKnowledge(params: {
  workspaceId: string;
  query: string;
  limit?: number;
}): Promise<SearchMeetingHit[]> {
  await ensureMeetingIntelligenceSchema();
  const pool = getDbPool();
  const normalizedQuery = params.query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const result = await pool.query<{
    meeting_id: string;
    room_id: string;
    ended_at: string | null;
    rank: string;
    snippet: string;
  }>(
    `
    SELECT
      d.meeting_id::text AS meeting_id,
      m.room_id,
      m.ended_at,
      ts_rank_cd(to_tsvector('english', d.content), plainto_tsquery('english', $2))::text AS rank,
      ts_headline(
        'english',
        d.content,
        plainto_tsquery('english', $2),
        'MinWords=8,MaxWords=22,MaxFragments=2,StartSel=<b>,StopSel=</b>'
      ) AS snippet
    FROM meeting_search_documents d
    INNER JOIN meetings m ON m.id = d.meeting_id
    WHERE d.workspace_id = $1
      AND to_tsvector('english', d.content) @@ plainto_tsquery('english', $2)
    ORDER BY ts_rank_cd(to_tsvector('english', d.content), plainto_tsquery('english', $2)) DESC,
             COALESCE(m.ended_at, m.created_at) DESC
    LIMIT $3
    `,
    [params.workspaceId, normalizedQuery, limit],
  );

  return result.rows.map((row) => ({
    meetingId: row.meeting_id,
    roomId: row.room_id,
    endedAt: row.ended_at,
    rank: Number(row.rank || 0),
    snippet: row.snippet,
  }));
}

export async function listMeetingHistory(workspaceId: string, limit = 50): Promise<MeetingHistoryItem[]> {
  const pool = getDbPool();
  const result = await pool.query<{
    meeting_id: string;
    room_id: string;
    ended_at: string | null;
    summary: string;
    key_points: unknown;
    action_items: unknown;
    created_at: string;
    transcript_count: string;
    has_recording: boolean;
  }>(
    `
    WITH latest_summary AS (
      SELECT DISTINCT ON (meeting_id)
        meeting_id,
        summary,
        key_points,
        action_items,
        created_at
      FROM meeting_summaries
      ORDER BY meeting_id, created_at DESC
    )
    SELECT
      ls.meeting_id,
      m.room_id,
      m.ended_at,
      ls.summary,
      ls.key_points,
      ls.action_items,
      ls.created_at,
      (
        SELECT COUNT(*)::text
        FROM transcripts t
        WHERE t.meeting_id = m.id
      ) AS transcript_count,
      (m.recording_path IS NOT NULL) AS has_recording
    FROM latest_summary ls
    INNER JOIN meetings m ON m.id = ls.meeting_id
    WHERE m.workspace_id = $1
    ORDER BY ls.created_at DESC
    LIMIT $2
    `,
    [workspaceId, limit],
  );

  return result.rows.map((row) => ({
    meetingId: row.meeting_id,
    roomId: row.room_id,
    endedAt: row.ended_at,
    summary: row.summary,
    keyPoints: Array.isArray(row.key_points) ? (row.key_points as string[]) : [],
    actionItems: Array.isArray(row.action_items) ? (row.action_items as string[]) : [],
    createdAt: row.created_at,
    transcriptCount: Number(row.transcript_count || 0),
    hasRecording: row.has_recording,
  }));
}

export async function getMeetingHistoryDetail(
  workspaceId: string,
  meetingId: string,
): Promise<MeetingHistoryDetail | null> {
  const pool = getDbPool();

  const summaryResult = await pool.query<{
    meeting_id: string;
    room_id: string;
    ended_at: string | null;
    summary: string;
    key_points: unknown;
    action_items: unknown;
    created_at: string;
    recording_path: string | null;
  }>(
    `
    WITH latest_summary AS (
      SELECT DISTINCT ON (meeting_id)
        meeting_id,
        summary,
        key_points,
        action_items,
        created_at
      FROM meeting_summaries
      WHERE meeting_id = $1
      ORDER BY meeting_id, created_at DESC
    )
    SELECT
      ls.meeting_id,
      m.room_id,
      m.ended_at,
      ls.summary,
      ls.key_points,
      ls.action_items,
      ls.created_at,
      m.recording_path
    FROM latest_summary ls
    INNER JOIN meetings m ON m.id = ls.meeting_id
    WHERE m.workspace_id = $2
    `,
    [meetingId, workspaceId],
  );

  const summaryRow = summaryResult.rows[0];
  if (!summaryRow) {
    return null;
  }

  const transcriptResult = await pool.query<{
    id: string;
    speaker_name: string;
    text: string;
    is_final: boolean;
    created_at: string;
  }>(
    `
    SELECT id, speaker_name, text, is_final, created_at
    FROM transcripts
    WHERE meeting_id = $1
    ORDER BY created_at ASC
    `,
    [meetingId],
  );

  const chatResult = await pool.query<{
    id: string;
    sender_name: string;
    message: string;
    sent_at: string;
  }>(
    `
    SELECT id, sender_name, message, sent_at
    FROM chat_messages
    WHERE meeting_id = $1
    ORDER BY sent_at ASC
    `,
    [meetingId],
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS meeting_files (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      sender_id TEXT,
      sender_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type TEXT NOT NULL,
      shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
  );

  const fileResult = await pool.query<{
    id: string;
    sender_name: string;
    file_name: string;
    file_size: string;
    mime_type: string;
    shared_at: string;
  }>(
    `
    SELECT id, sender_name, file_name, file_size::text, mime_type, shared_at
    FROM meeting_files
    WHERE meeting_id = $1
    ORDER BY shared_at ASC
    `,
    [meetingId],
  );

  return {
    meetingId: summaryRow.meeting_id,
    roomId: summaryRow.room_id,
    endedAt: summaryRow.ended_at,
    summary: summaryRow.summary,
    keyPoints: Array.isArray(summaryRow.key_points) ? (summaryRow.key_points as string[]) : [],
    actionItems: Array.isArray(summaryRow.action_items)
      ? (summaryRow.action_items as string[])
      : [],
    createdAt: summaryRow.created_at,
    transcripts: transcriptResult.rows.map((row) => ({
      id: row.id,
      speakerName: row.speaker_name,
      text: row.text,
      isFinal: row.is_final,
      createdAt: row.created_at,
    })),
    chatMessages: chatResult.rows.map((row) => ({
      id: row.id,
      senderName: row.sender_name,
      message: row.message,
      sentAt: row.sent_at,
    })),
    sharedFiles: fileResult.rows.map((row) => ({
      id: row.id,
      senderName: row.sender_name,
      fileName: row.file_name,
      fileSize: Number(row.file_size || 0),
      mimeType: row.mime_type,
      sharedAt: row.shared_at,
    })),
    recordingPath: summaryRow.recording_path,
  };
}

export async function getRecordingPathByMeetingId(
  workspaceId: string,
  meetingId: string,
): Promise<string | null> {
  const pool = getDbPool();
  const result = await pool.query<{ recording_path: string | null }>(
    `
    SELECT recording_path
    FROM meetings
    WHERE workspace_id = $1
      AND (id::text = $2 OR room_id = $2)
      AND recording_path IS NOT NULL
    ORDER BY COALESCE(ended_at, created_at) DESC
    LIMIT 1
    `,
    [workspaceId, meetingId],
  );

  return result.rows[0]?.recording_path || null;
}

export async function getMeetingAnalytics(
  workspaceId: string,
  meetingId: string,
): Promise<MeetingAnalytics | null> {
  const pool = getDbPool();

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      sender_id TEXT,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
  );

  const meetingResult = await pool.query<{
    id: string;
    room_id: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: string;
  }>(
    `
    SELECT
      id,
      room_id,
      COALESCE(started_at, created_at) AS started_at,
      ended_at,
      EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - COALESCE(started_at, created_at)))::text AS duration_seconds
    FROM meetings
    WHERE id = $1 AND workspace_id = $2
    LIMIT 1
    `,
    [meetingId, workspaceId],
  );

  const meeting = meetingResult.rows[0];
  if (!meeting) {
    return null;
  }

  const transcriptResult = await pool.query<{
    speaker_name: string;
    created_at: string;
  }>(
    `
    SELECT speaker_name, created_at
    FROM transcripts
    WHERE meeting_id = $1 AND is_final = TRUE
    ORDER BY created_at ASC
    `,
    [meetingId],
  );

  const chatResult = await pool.query<{
    sender_name: string;
    count: string;
  }>(
    `
    SELECT sender_name, COUNT(*)::text AS count
    FROM chat_messages
    WHERE meeting_id = $1
    GROUP BY sender_name
    ORDER BY COUNT(*) DESC, sender_name ASC
    `,
    [meetingId],
  );

  const transcriptSpeakers = new Set(transcriptResult.rows.map((row) => row.speaker_name));
  const chatSpeakers = new Set(chatResult.rows.map((row) => row.sender_name));
  const participantCount = new Set([...transcriptSpeakers, ...chatSpeakers]).size;

  const speakingTime = estimateSpeakingTime(
    transcriptResult.rows.map((row) => ({
      speakerName: row.speaker_name,
      createdAt: row.created_at,
    })),
  );

  const messagesPerParticipant = chatResult.rows.map((row) => ({
    senderName: row.sender_name,
    count: Number(row.count || 0),
  }));

  const totalMessages = messagesPerParticipant.reduce((acc, row) => acc + row.count, 0);

  return {
    meetingId: meeting.id,
    roomId: meeting.room_id,
    startedAt: meeting.started_at,
    endedAt: meeting.ended_at,
    durationSeconds: Math.max(0, Math.round(Number(meeting.duration_seconds || 0))),
    participantCount,
    speakingTime,
    chatActivity: {
      totalMessages,
      messagesPerParticipant,
    },
  };
}

export async function getWorkspaceAnalyticsOverview(
  workspaceId: string,
): Promise<WorkspaceAnalyticsOverview> {
  const pool = getDbPool();

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      sender_id TEXT,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
  );

  const totalsResult = await pool.query<{
    meetings: string;
    total_duration_seconds: string;
    average_participants: string;
    average_chat_messages: string;
  }>(
    `
    WITH per_meeting AS (
      SELECT
        m.id,
        EXTRACT(EPOCH FROM (COALESCE(m.ended_at, NOW()) - COALESCE(m.started_at, m.created_at))) AS duration_seconds,
        (
          SELECT COUNT(*)
          FROM (
            SELECT DISTINCT speaker_name AS name FROM transcripts t WHERE t.meeting_id = m.id
            UNION
            SELECT DISTINCT sender_name AS name FROM chat_messages c WHERE c.meeting_id = m.id
          ) participants
        ) AS participant_count,
        (
          SELECT COUNT(*)
          FROM chat_messages c
          WHERE c.meeting_id = m.id
        ) AS chat_count
      FROM meetings m
      WHERE m.workspace_id = $1
    )
    SELECT
      COUNT(*)::text AS meetings,
      COALESCE(SUM(duration_seconds), 0)::text AS total_duration_seconds,
      COALESCE(AVG(participant_count), 0)::text AS average_participants,
      COALESCE(AVG(chat_count), 0)::text AS average_chat_messages
    FROM per_meeting
    `,
    [workspaceId],
  );

  const recentResult = await pool.query<{
    meeting_id: string;
    room_id: string;
    ended_at: string | null;
    duration_seconds: string;
    participant_count: string;
    chat_messages: string;
  }>(
    `
    SELECT
      m.id AS meeting_id,
      m.room_id,
      m.ended_at,
      EXTRACT(EPOCH FROM (COALESCE(m.ended_at, NOW()) - COALESCE(m.started_at, m.created_at)))::text AS duration_seconds,
      (
        SELECT COUNT(*)::text
        FROM (
          SELECT DISTINCT speaker_name AS name FROM transcripts t WHERE t.meeting_id = m.id
          UNION
          SELECT DISTINCT sender_name AS name FROM chat_messages c WHERE c.meeting_id = m.id
        ) participants
      ) AS participant_count,
      (
        SELECT COUNT(*)::text FROM chat_messages c WHERE c.meeting_id = m.id
      ) AS chat_messages
    FROM meetings m
    WHERE m.workspace_id = $1
    ORDER BY COALESCE(m.ended_at, m.created_at) DESC
    LIMIT 12
    `,
    [workspaceId],
  );

  const trendResult = await pool.query<{
    day: string;
    meetings: string;
    chat_messages: string;
  }>(
    `
    SELECT
      DATE_TRUNC('day', COALESCE(m.ended_at, m.created_at))::date::text AS day,
      COUNT(*)::text AS meetings,
      COALESCE(SUM((SELECT COUNT(*) FROM chat_messages c WHERE c.meeting_id = m.id)), 0)::text AS chat_messages
    FROM meetings m
    WHERE m.workspace_id = $1
      AND COALESCE(m.ended_at, m.created_at) >= NOW() - INTERVAL '13 days'
    GROUP BY DATE_TRUNC('day', COALESCE(m.ended_at, m.created_at))::date
    ORDER BY DATE_TRUNC('day', COALESCE(m.ended_at, m.created_at))::date ASC
    `,
    [workspaceId],
  );

  const topSpeakersResult = await pool.query<{
    speaker_name: string;
    turns: string;
  }>(
    `
    SELECT
      t.speaker_name,
      COUNT(*)::text AS turns
    FROM transcripts t
    INNER JOIN meetings m ON m.id = t.meeting_id
    WHERE m.workspace_id = $1
      AND t.is_final = TRUE
    GROUP BY t.speaker_name
    ORDER BY COUNT(*) DESC, t.speaker_name ASC
    LIMIT 8
    `,
    [workspaceId],
  );

  const totalsRow = totalsResult.rows[0] || {
    meetings: "0",
    total_duration_seconds: "0",
    average_participants: "0",
    average_chat_messages: "0",
  };

  const trendMap = new Map(
    trendResult.rows.map((row) => [row.day, { meetings: Number(row.meetings || 0), chatMessages: Number(row.chat_messages || 0) }]),
  );

  const trend: WorkspaceAnalyticsOverview["trend"] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const row = trendMap.get(key);
    trend.push({
      date: key,
      meetings: row?.meetings ?? 0,
      chatMessages: row?.chatMessages ?? 0,
    });
  }

  return {
    totals: {
      meetings: Number(totalsRow.meetings || 0),
      totalDurationSeconds: Math.round(Number(totalsRow.total_duration_seconds || 0)),
      averageParticipants: Number(Number(totalsRow.average_participants || 0).toFixed(1)),
      averageChatMessages: Number(Number(totalsRow.average_chat_messages || 0).toFixed(1)),
    },
    recentMeetings: recentResult.rows.map((row) => ({
      meetingId: row.meeting_id,
      roomId: row.room_id,
      endedAt: row.ended_at,
      durationSeconds: Math.max(0, Math.round(Number(row.duration_seconds || 0))),
      participantCount: Number(row.participant_count || 0),
      chatMessages: Number(row.chat_messages || 0),
    })),
    trend,
    topSpeakers: topSpeakersResult.rows.map((row) => ({
      speakerName: row.speaker_name,
      turns: Number(row.turns || 0),
    })),
  };
}
