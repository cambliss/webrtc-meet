import { getDbPool } from "@/src/lib/db";

/**
 * Watermark metadata for a recorded meeting.
 * Used for audit trails, DLP compliance, and recording traceability.
 */
export type RecordingWatermarkMetadata = {
  recordingPath: string;
  meetingId: string;
  roomId: string;
  workspaceId: string;
  hostUserId: string | null;
  watermarkText?: string; // Visual watermark (e.g., "CONFIDENTIAL | room-123 | user-456")
  audioWatermarkEnabled?: boolean; // Audio watermark/fingerprinting
  metadata?: Record<string, unknown>; // Additional metadata (compliance flags, DLP tags, etc.)
};

/**
 * Add watermark metadata to a recorded meeting.
 * Stores audit trail for compliance, DLP, and traceability.
 */
export async function addRecordingWatermarkMetadata(
  params: RecordingWatermarkMetadata,
): Promise<void> {
  const pool = getDbPool();

  try {
    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS recording_watermarks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recording_path TEXT NOT NULL UNIQUE,
        meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        room_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        host_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        watermark_text TEXT,
        audio_watermark_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_recording_watermarks_meeting_id
      ON recording_watermarks(meeting_id)
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_recording_watermarks_workspace_id
      ON recording_watermarks(workspace_id)
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_recording_watermarks_created_at
      ON recording_watermarks(created_at)
      `,
    );

    // Insert watermark metadata
    await pool.query(
      `
      INSERT INTO recording_watermarks (
        recording_path, meeting_id, room_id, workspace_id, host_user_id,
        watermark_text, audio_watermark_enabled, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (recording_path) DO UPDATE SET
        watermark_text = COALESCE(EXCLUDED.watermark_text, recording_watermarks.watermark_text),
        metadata = recording_watermarks.metadata || EXCLUDED.metadata,
        updated_at = NOW()
      `,
      [
        params.recordingPath,
        params.meetingId,
        params.roomId,
        params.workspaceId,
        params.hostUserId || null,
        params.watermarkText || null,
        params.audioWatermarkEnabled || false,
        JSON.stringify({
          ...params.metadata,
          watermarkVersion: "1.0",
          appliedAt: new Date().toISOString(),
        }),
      ],
    );
  } catch (error) {
    console.error("Failed to add recording watermark metadata:", error);
    // Non-critical: don't fail the recording upload if metadata insert fails
  }
}

/**
 * Generate watermark text for a recording.
 * Format: "MeetFlow CONFIDENTIAL | room-{roomId} | {hostUsername}"
 */
export function generateRecordingWatermarkText(params: {
  roomId: string;
  hostUsername?: string;
  customTemplate?: string;
}): string {
  if (params.customTemplate) {
    return params.customTemplate
      .replace(/\{roomId\}/g, params.roomId)
      .replace(/\{hostUsername\}/g, params.hostUsername || "unknown");
  }

  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `MeetFlow CONFIDENTIAL | room-${params.roomId} | ${params.hostUsername || "meeting"} | ${timestamp}`;
}

/**
 * Escape special characters for FFmpeg drawtext filter.
 * Required to prevent FFmpeg command injection.
 */
export function escapeFfmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\") // Backslash
    .replace(/'/g, "\\'") // Single quote
    .replace(/:/g, "\\:") // Colon
    .replace(/\n/g, " "); // Newline
}

/**
 * Generate FFmpeg watermark filter for video.
 * Overlays a semi-transparent text watermark on the bottom-right of video.
 */
export function generateFfmpegWatermarkFilter(watermarkText: string): string[] {
  const escaped = escapeFfmpegDrawtext(watermarkText);
  return [
    "-vf",
    `drawtext=text='${escaped}':fontcolor=white@0.35:fontsize=24:x=(w-text_w-28):y=(h-text_h-28):box=1:boxcolor=black@0.25:boxborderw=10`,
  ];
}

/**
 * Get watermark metadata for a recording by meeting ID.
 */
export async function getRecordingWatermarkMetadata(meetingId: string): Promise<RecordingWatermarkMetadata | null> {
  const pool = getDbPool();

  try {
    const result = await pool.query(
      `
      SELECT
        recording_path, meeting_id, room_id, workspace_id, host_user_id,
        watermark_text, audio_watermark_enabled, metadata
      FROM recording_watermarks
      WHERE meeting_id = $1
      LIMIT 1
      `,
      [meetingId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      recordingPath: row.recording_path,
      meetingId: row.meeting_id,
      roomId: row.room_id,
      workspaceId: row.workspace_id,
      hostUserId: row.host_user_id,
      watermarkText: row.watermark_text,
      audioWatermarkEnabled: row.audio_watermark_enabled,
      metadata: row.metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Add DLP (Data Loss Prevention) metadata to a recording.
 * Mark recording with compliance flags, sensitivity levels, etc.
 */
export async function tagRecordingWithDlpMetadata(
  meetingId: string,
  dlpMetadata: {
    sensitivityLevel?: "public" | "internal" | "confidential" | "restricted";
    dataClassification?: string[];
    exportRestricted?: boolean;
    retentionDays?: number;
    requiresApprovalForExport?: boolean;
  },
): Promise<void> {
  const pool = getDbPool();

  try {
    await pool.query(
      `
      UPDATE recording_watermarks
      SET
        metadata = metadata || $2,
        updated_at = NOW()
      WHERE meeting_id = $1
      `,
      [
        meetingId,
        JSON.stringify({
          dlp: dlpMetadata,
          dlpAppliedAt: new Date().toISOString(),
        }),
      ],
    );
  } catch (error) {
    console.error("Failed to tag recording with DLP metadata:", error);
  }
}

/**
 * List all recordings for a workspace with watermark metadata.
 * Useful for compliance audits and DLP enforcement.
 */
export async function listWorkspaceRecordingsWithWatermarks(
  workspaceId: string,
  limit = 100,
): Promise<Array<RecordingWatermarkMetadata & { createdAt: string }>> {
  const pool = getDbPool();

  try {
    const result = await pool.query(
      `
      SELECT
        recording_path, meeting_id, room_id, workspace_id, host_user_id,
        watermark_text, audio_watermark_enabled, metadata, created_at
      FROM recording_watermarks
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [workspaceId, limit],
    );

    return result.rows.map((row) => ({
      recordingPath: row.recording_path,
      meetingId: row.meeting_id,
      roomId: row.room_id,
      workspaceId: row.workspace_id,
      hostUserId: row.host_user_id,
      watermarkText: row.watermark_text,
      audioWatermarkEnabled: row.audio_watermark_enabled,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
