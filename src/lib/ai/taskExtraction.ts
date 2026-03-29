type ExtractMeetingTasksInput = {
  transcript: string;
  summary: string;
  actionItems: string[];
};

export type ExtractedMeetingTask = {
  title: string;
  assigneeName: string | null;
  dueDate: string | null;
  confidence: number;
  sourceText: string;
};

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_SUMMARY_MODEL || "claude-3-5-sonnet-latest";

function resolveSummaryProvider(): "openai" | "anthropic" {
  const configured = (process.env.AI_SUMMARY_PROVIDER || "").trim().toLowerCase();
  if (configured === "openai" || configured === "anthropic") {
    return configured;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }

  return "openai";
}

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.5;
  }

  return Math.min(1, Math.max(0, parsed));
}

function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoDateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoDateMatch) {
    return trimmed;
  }

  return parseDueDateFromText(trimmed);
}

function parseDueDateFromText(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const monthPattern = /\b(?:by|due|before|on)?\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/i;
  const dayFirstPattern = /\b(?:by|due|before|on)?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{4})?)\b/i;
  const slashPattern = /\b(?:by|due|before|on)?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;

  const candidate =
    normalized.match(monthPattern)?.[1] ||
    normalized.match(dayFirstPattern)?.[1] ||
    normalized.match(slashPattern)?.[1] ||
    "";

  if (!candidate) {
    return null;
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function extractAssignee(line: string): { assigneeName: string | null; title: string } {
  const trimmed = line.trim();
  const prefixedMatch = trimmed.match(/^([A-Z][A-Za-z0-9 .'-]{1,40})\s*[:\-]\s*(.+)$/);
  if (prefixedMatch) {
    return {
      assigneeName: prefixedMatch[1].trim(),
      title: prefixedMatch[2].trim(),
    };
  }

  const actionLeadMatch = trimmed.match(
    /^([A-Z][A-Za-z0-9 .'-]{1,40})\s+(?:to|will|should|must|needs to|need to)\s+(.+)$/i,
  );
  if (actionLeadMatch) {
    return {
      assigneeName: actionLeadMatch[1].trim(),
      title: actionLeadMatch[2].trim(),
    };
  }

  const assignedMatch = trimmed.match(/\bassigned to\s+([A-Z][A-Za-z0-9 .'-]{1,40})\b/i);
  if (assignedMatch) {
    return {
      assigneeName: assignedMatch[1].trim(),
      title: trimmed.replace(assignedMatch[0], "").replace(/\s{2,}/g, " ").trim(),
    };
  }

  return {
    assigneeName: null,
    title: trimmed,
  };
}

function normalizeTaskShape(value: unknown): ExtractedMeetingTask[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const payload = value as {
    tasks?: Array<{
      title?: unknown;
      assigneeName?: unknown;
      dueDate?: unknown;
      confidence?: unknown;
      sourceText?: unknown;
    }>;
  };

  if (!Array.isArray(payload.tasks)) {
    return [];
  }

  return payload.tasks
    .map((task) => {
      const title = typeof task.title === "string" ? task.title.trim() : "";
      const sourceText =
        typeof task.sourceText === "string" && task.sourceText.trim()
          ? task.sourceText.trim()
          : title;

      if (!title) {
        return null;
      }

      return {
        title,
        assigneeName:
          typeof task.assigneeName === "string" && task.assigneeName.trim()
            ? task.assigneeName.trim()
            : null,
        dueDate: normalizeDueDate(task.dueDate),
        confidence: clampConfidence(task.confidence),
        sourceText,
      };
    })
    .filter((task): task is ExtractedMeetingTask => Boolean(task));
}

function fallbackExtract(actionItems: string[]): ExtractedMeetingTask[] {
  return actionItems
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const assignee = extractAssignee(line);
      return {
        title: assignee.title,
        assigneeName: assignee.assigneeName,
        dueDate: parseDueDateFromText(line),
        confidence: assignee.assigneeName ? 0.5 : 0.35,
        sourceText: line,
      };
    });
}

export function extractMeetingTasksHeuristic(actionItems: string[]): ExtractedMeetingTask[] {
  return fallbackExtract(actionItems);
}

function stripFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function extractMeetingTasks(
  input: ExtractMeetingTasksInput,
): Promise<ExtractedMeetingTask[]> {
  const actionItems = input.actionItems.map((item) => item.trim()).filter(Boolean);
  if (actionItems.length === 0 && !input.transcript.trim()) {
    return [];
  }

  const prompt = [
    "Extract actionable tasks from the meeting artifacts.",
    "Return strict JSON with shape {\"tasks\":[{\"title\":string,\"assigneeName\":string|null,\"dueDate\":\"YYYY-MM-DD\"|null,\"confidence\":number,\"sourceText\":string}]}",
    "Only include real tasks. Max 20 tasks.",
    "Infer assigneeName when one person is clearly responsible for the task.",
    "Normalize explicit due dates like 2026-04-15, Apr 15 2026, or 15 Apr 2026 to YYYY-MM-DD.",
    "If due date is unclear or only relative, set dueDate to null.",
    "If assignee is unclear, set assigneeName to null.",
    "",
    `Summary:\n${input.summary || "N/A"}`,
    `Action Items:\n${actionItems.join("\n") || "N/A"}`,
    `Transcript:\n${input.transcript.slice(0, 12000) || "N/A"}`,
  ].join("\n");

  const provider = resolveSummaryProvider();

  try {
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return fallbackExtract(actionItems);
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 1400,
          temperature: 0,
          system: "You are a task extraction assistant. Return only JSON.",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        return fallbackExtract(actionItems);
      }

      const completion = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const content = completion.content?.find((item) => item?.type === "text")?.text;
      if (!content) {
        return fallbackExtract(actionItems);
      }

      const parsed = JSON.parse(stripFence(content));
      const normalized = normalizeTaskShape(parsed);
      return normalized.length > 0 ? normalized : fallbackExtract(actionItems);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return fallbackExtract(actionItems);
    }

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You extract structured tasks from meetings and return only JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallbackExtract(actionItems);
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackExtract(actionItems);
    }

    const parsed = JSON.parse(stripFence(content));
    const normalized = normalizeTaskShape(parsed);
    return normalized.length > 0 ? normalized : fallbackExtract(actionItems);
  } catch {
    return fallbackExtract(actionItems);
  }
}
