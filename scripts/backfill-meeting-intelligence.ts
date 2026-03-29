import { config as loadEnv } from "dotenv";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";

import { extractMeetingTasks, extractMeetingTasksHeuristic } from "@/src/lib/ai/taskExtraction";
import { replaceMeetingHighlights, replaceMeetingTasks } from "@/src/lib/repositories/meetingSummaryRepository";
import { extractSemanticHighlights } from "@/src/lib/smartHighlights";
import type { TranscriptLine } from "@/src/types/meeting";

type CandidateMeeting = {
  meetingId: string;
  workspaceId: string;
  roomId: string;
  summary: string;
  actionItems: unknown;
  hasTasks: boolean;
  hasHighlights: boolean;
};

type ParsedArgs = {
  workspaceId?: string;
  workspaceRequired: boolean;
  statusOnly: boolean;
  limit: number;
  dryRun: boolean;
  useAi: boolean;
  strictAi: boolean;
  forceRerun: boolean;
  maxWrites?: number;
  reportFormat: "none" | "json" | "csv";
  reportFile?: string;
  confirm?: string;
};

type BackfillReportRow = {
  meetingId: string;
  workspaceId: string;
  roomId: string;
  hadTasks: boolean;
  hadHighlights: boolean;
  highlightsComputed: number;
  tasksComputed: number;
  highlightsWritten: boolean;
  tasksWritten: boolean;
  skippedByMaxWrites: boolean;
  taskMode: "existing" | "heuristic" | "ai-requested";
};

loadEnv({ path: ".env.local" });
loadEnv();

function parseArgs(argv: string[]): ParsedArgs {
  let workspaceId: string | undefined;
  let workspaceRequired = false;
  let statusOnly = false;
  let limit = 200;
  let dryRun = true;
  let useAi = false;
  let strictAi = false;
  let forceRerun = false;
  let maxWrites: number | undefined;
  let reportFormat: ParsedArgs["reportFormat"] = "none";
  let reportFile: string | undefined;
  let confirm: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace" && argv[index + 1]) {
      workspaceId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--workspace-required") {
      workspaceRequired = true;
      continue;
    }
    if (arg === "--status") {
      statusOnly = true;
      continue;
    }
    if (arg === "--limit" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 2000);
      }
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--apply") {
      dryRun = false;
      continue;
    }
    if (arg === "--use-ai") {
      useAi = true;
      continue;
    }
    if (arg === "--strict-ai") {
      strictAi = true;
      continue;
    }
    if (arg === "--force-rerun") {
      forceRerun = true;
      continue;
    }
    if (arg === "--max-writes" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxWrites = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
    if (arg === "--report" && argv[index + 1]) {
      const value = argv[index + 1].trim().toLowerCase();
      if (value === "json" || value === "csv") {
        reportFormat = value;
      }
      index += 1;
      continue;
    }
    if (arg === "--report-file" && argv[index + 1]) {
      reportFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--confirm" && argv[index + 1]) {
      confirm = argv[index + 1];
      index += 1;
    }
  }

  return {
    workspaceId,
    workspaceRequired,
    statusOnly,
    limit,
    dryRun,
    useAi,
    strictAi,
    forceRerun,
    maxWrites,
    reportFormat,
    reportFile,
    confirm,
  };
}

function hasAiProviderConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function toCsv(rows: BackfillReportRow[]): string {
  const header = [
    "meetingId",
    "workspaceId",
    "roomId",
    "hadTasks",
    "hadHighlights",
    "highlightsComputed",
    "tasksComputed",
    "highlightsWritten",
    "tasksWritten",
    "skippedByMaxWrites",
    "taskMode",
  ];

  const escaped = (value: string | number | boolean) => {
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  };

  const body = rows.map((row) =>
    [
      row.meetingId,
      row.workspaceId,
      row.roomId,
      row.hadTasks,
      row.hadHighlights,
      row.highlightsComputed,
      row.tasksComputed,
      row.highlightsWritten,
      row.tasksWritten,
      row.skippedByMaxWrites,
      row.taskMode,
    ]
      .map(escaped)
      .join(","),
  );

  return [header.join(","), ...body].join("\n");
}

async function emitReport(args: ParsedArgs, rows: BackfillReportRow[]): Promise<void> {
  if (args.reportFormat === "none") {
    return;
  }

  const output =
    args.reportFormat === "json"
      ? JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            maxWrites: args.maxWrites ?? null,
            summary: {
              processed: rows.length,
              wroteHighlights: rows.filter((row) => row.highlightsWritten).length,
              wroteTasks: rows.filter((row) => row.tasksWritten).length,
              skippedByMaxWrites: rows.filter((row) => row.skippedByMaxWrites).length,
            },
            rows,
          },
          null,
          2,
        )
      : toCsv(rows);

  if (args.reportFile) {
    await writeFile(args.reportFile, `${output}\n`, "utf8");
    process.stdout.write(`Report written to ${args.reportFile}\n`);
    return;
  }

  process.stdout.write(`${output}\n`);
}

function parseActionItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseActionItems(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

async function ensureIntelligenceTables(pool: Pool): Promise<void> {
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
    CREATE TABLE IF NOT EXISTS meeting_highlights (
      id UUID PRIMARY KEY,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      speaker_name TEXT NOT NULL,
      text TEXT NOT NULL,
      category TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS meeting_intelligence_backfill (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      task_mode TEXT NOT NULL,
      highlights_count INTEGER NOT NULL,
      tasks_count INTEGER NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, meeting_id)
    )
    `,
  );
}

async function getCandidateMeetings(pool: Pool, args: ParsedArgs): Promise<CandidateMeeting[]> {
  const result = await pool.query<CandidateMeeting>(
    `
    WITH latest_summary AS (
      SELECT DISTINCT ON (meeting_id)
        meeting_id,
        summary,
        action_items
      FROM meeting_summaries
      ORDER BY meeting_id, created_at DESC
    )
    SELECT
      m.id::text AS "meetingId",
      m.workspace_id AS "workspaceId",
      m.room_id AS "roomId",
      COALESCE(ls.summary, '') AS summary,
      COALESCE(ls.action_items, '[]'::jsonb) AS "actionItems",
      EXISTS (
        SELECT 1
        FROM meeting_tasks mt
        WHERE mt.meeting_id = m.id
          AND mt.workspace_id = m.workspace_id
      ) AS "hasTasks",
      EXISTS (
        SELECT 1
        FROM meeting_highlights mh
        WHERE mh.meeting_id = m.id
          AND mh.workspace_id = m.workspace_id
      ) AS "hasHighlights"
    FROM meetings m
    LEFT JOIN latest_summary ls ON ls.meeting_id = m.id
    WHERE m.status = 'ended'
      AND ($1::text IS NULL OR m.workspace_id = $1)
      AND (
        $3::boolean = TRUE
        OR NOT EXISTS (
          SELECT 1
          FROM meeting_intelligence_backfill mib
          WHERE mib.workspace_id = m.workspace_id
            AND mib.meeting_id = m.id
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM meeting_tasks mt
          WHERE mt.meeting_id = m.id
            AND mt.workspace_id = m.workspace_id
        )
        OR NOT EXISTS (
          SELECT 1
          FROM meeting_highlights mh
          WHERE mh.meeting_id = m.id
            AND mh.workspace_id = m.workspace_id
        )
      )
    ORDER BY COALESCE(m.ended_at, m.created_at) DESC
    LIMIT $2
    `,
    [args.workspaceId || null, args.limit, args.forceRerun],
  );

  return result.rows;
}

async function markBackfillProcessed(
  pool: Pool,
  params: {
    workspaceId: string;
    meetingId: string;
    taskMode: BackfillReportRow["taskMode"];
    highlightsCount: number;
    tasksCount: number;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO meeting_intelligence_backfill (
      workspace_id, meeting_id, task_mode, highlights_count, tasks_count, processed_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (workspace_id, meeting_id)
    DO UPDATE SET
      task_mode = EXCLUDED.task_mode,
      highlights_count = EXCLUDED.highlights_count,
      tasks_count = EXCLUDED.tasks_count,
      processed_at = NOW()
    `,
    [params.workspaceId, params.meetingId, params.taskMode, params.highlightsCount, params.tasksCount],
  );
}

async function printBackfillStatus(pool: Pool, workspaceId?: string): Promise<void> {
  const totals = await pool.query<{
    total_ended: string;
    tracked_ended: string;
    untracked_ended: string;
  }>(
    `
    SELECT
      COUNT(*) FILTER (WHERE m.status = 'ended')::text AS total_ended,
      COUNT(*) FILTER (
        WHERE m.status = 'ended'
          AND EXISTS (
            SELECT 1
            FROM meeting_intelligence_backfill mib
            WHERE mib.workspace_id = m.workspace_id
              AND mib.meeting_id = m.id
          )
      )::text AS tracked_ended,
      COUNT(*) FILTER (
        WHERE m.status = 'ended'
          AND NOT EXISTS (
            SELECT 1
            FROM meeting_intelligence_backfill mib
            WHERE mib.workspace_id = m.workspace_id
              AND mib.meeting_id = m.id
          )
      )::text AS untracked_ended
    FROM meetings m
    WHERE ($1::text IS NULL OR m.workspace_id = $1)
    `,
    [workspaceId || null],
  );

  const row = totals.rows[0] || {
    total_ended: "0",
    tracked_ended: "0",
    untracked_ended: "0",
  };

  const byWorkspace = await pool.query<{
    workspace_id: string;
    total_ended: string;
    tracked_ended: string;
    untracked_ended: string;
  }>(
    `
    SELECT
      m.workspace_id,
      COUNT(*) FILTER (WHERE m.status = 'ended')::text AS total_ended,
      COUNT(*) FILTER (
        WHERE m.status = 'ended'
          AND EXISTS (
            SELECT 1
            FROM meeting_intelligence_backfill mib
            WHERE mib.workspace_id = m.workspace_id
              AND mib.meeting_id = m.id
          )
      )::text AS tracked_ended,
      COUNT(*) FILTER (
        WHERE m.status = 'ended'
          AND NOT EXISTS (
            SELECT 1
            FROM meeting_intelligence_backfill mib
            WHERE mib.workspace_id = m.workspace_id
              AND mib.meeting_id = m.id
          )
      )::text AS untracked_ended
    FROM meetings m
    WHERE ($1::text IS NULL OR m.workspace_id = $1)
    GROUP BY m.workspace_id
    ORDER BY m.workspace_id ASC
    `,
    [workspaceId || null],
  );

  process.stdout.write(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        workspace: workspaceId || "all",
        totals: {
          totalEnded: Number(row.total_ended || 0),
          trackedEnded: Number(row.tracked_ended || 0),
          untrackedEnded: Number(row.untracked_ended || 0),
        },
        byWorkspace: byWorkspace.rows.map((item) => ({
          workspaceId: item.workspace_id,
          totalEnded: Number(item.total_ended || 0),
          trackedEnded: Number(item.tracked_ended || 0),
          untrackedEnded: Number(item.untracked_ended || 0),
        })),
      },
      null,
      2,
    ) + "\n",
  );
}

async function getFinalTranscriptLines(pool: Pool, meetingId: string, roomId: string): Promise<TranscriptLine[]> {
  const transcriptResult = await pool.query<{
    id: string;
    speaker_name: string;
    text: string;
    created_at: string;
  }>(
    `
    SELECT id, speaker_name, text, created_at
    FROM transcripts
    WHERE meeting_id = $1
      AND is_final = TRUE
    ORDER BY created_at ASC
    `,
    [meetingId],
  );

  return transcriptResult.rows.map((row) => ({
    id: row.id,
    roomId,
    socketId: row.id,
    speakerName: row.speaker_name,
    text: row.text,
    isFinal: true,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun && args.confirm !== "apply-backfill") {
    throw new Error("Write mode requires --confirm apply-backfill");
  }
  if (!args.dryRun && args.workspaceRequired && !args.workspaceId) {
    throw new Error("--workspace-required is enabled, but --workspace was not provided");
  }
  if (args.useAi && args.strictAi && !hasAiProviderConfig()) {
    throw new Error("--strict-ai was provided but no OPENAI_API_KEY or ANTHROPIC_API_KEY is configured");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureIntelligenceTables(pool);

    if (args.statusOnly) {
      await printBackfillStatus(pool, args.workspaceId);
      return;
    }

    const candidates = await getCandidateMeetings(pool, args);

    let meetingsProcessed = 0;
    let highlightsBackfilled = 0;
    let tasksBackfilled = 0;
    let writeMeetings = 0;
    const reportRows: BackfillReportRow[] = [];

    process.stdout.write(
      `Backfill started. candidates=${candidates.length} workspace=${args.workspaceId || "all"} dryRun=${args.dryRun} useAi=${args.useAi} forceRerun=${args.forceRerun} maxWrites=${args.maxWrites ?? "unbounded"}\n`,
    );

    for (const meeting of candidates) {
      const finalLines = await getFinalTranscriptLines(pool, meeting.meetingId, meeting.roomId);
      const transcriptText = finalLines
        .map((line) => `${line.speakerName}: ${line.text}`)
        .join("\n");
      const actionItems = parseActionItems(meeting.actionItems);

      const highlightPayload = extractSemanticHighlights(finalLines)
        .slice(0, 12)
        .map((highlight) => ({
          speakerName: highlight.speakerName,
          text: highlight.text,
          category: null,
        }));

      const taskPayload = meeting.hasTasks
        ? []
        : args.useAi
          ? await extractMeetingTasks({
              transcript: transcriptText,
              summary: meeting.summary,
              actionItems,
            })
          : extractMeetingTasksHeuristic(actionItems);
      const taskMode: BackfillReportRow["taskMode"] = meeting.hasTasks
        ? "existing"
        : args.useAi
          ? "ai-requested"
          : "heuristic";

      const needsWrite = !meeting.hasHighlights || !meeting.hasTasks;
      const skippedByMaxWrites =
        !args.dryRun &&
        needsWrite &&
        typeof args.maxWrites === "number" &&
        writeMeetings >= args.maxWrites;

      let highlightsWritten = false;
      let tasksWritten = false;

      if (!args.dryRun && !skippedByMaxWrites) {
        if (!meeting.hasHighlights) {
          await replaceMeetingHighlights({
            workspaceId: meeting.workspaceId,
            meetingId: meeting.meetingId,
            highlights: highlightPayload,
          });
          highlightsWritten = true;
        }

        if (!meeting.hasTasks) {
          await replaceMeetingTasks({
            workspaceId: meeting.workspaceId,
            meetingId: meeting.meetingId,
            tasks: taskPayload,
          });
          tasksWritten = true;
        }

        if (needsWrite) {
          writeMeetings += 1;
        }

        await markBackfillProcessed(pool, {
          workspaceId: meeting.workspaceId,
          meetingId: meeting.meetingId,
          taskMode,
          highlightsCount: highlightPayload.length,
          tasksCount: taskPayload.length,
        });
      }

      meetingsProcessed += 1;
      if (!meeting.hasHighlights) {
        highlightsBackfilled += 1;
      }
      if (!meeting.hasTasks) {
        tasksBackfilled += 1;
      }

      process.stdout.write(
        `[${meetingsProcessed}/${candidates.length}] room=${meeting.roomId} highlights=${meeting.hasHighlights ? "skip" : highlightPayload.length} tasks=${meeting.hasTasks ? "skip" : taskPayload.length} cap=${skippedByMaxWrites ? "skipped" : "ok"}\n`,
      );

      reportRows.push({
        meetingId: meeting.meetingId,
        workspaceId: meeting.workspaceId,
        roomId: meeting.roomId,
        hadTasks: meeting.hasTasks,
        hadHighlights: meeting.hasHighlights,
        highlightsComputed: highlightPayload.length,
        tasksComputed: taskPayload.length,
        highlightsWritten,
        tasksWritten,
        skippedByMaxWrites,
        taskMode,
      });
    }

    process.stdout.write(
      `Backfill complete. processed=${meetingsProcessed} highlightsBackfilled=${highlightsBackfilled} tasksBackfilled=${tasksBackfilled}\n`,
    );

    await emitReport(args, reportRows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Backfill failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});