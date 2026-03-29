import type { MeetingSummaryResult } from "@/src/types/ai";

type FormatMeetingNotesExportInput = {
  roomLabel: string;
  summary: MeetingSummaryResult;
  smartHighlights?: Array<{ speakerName: string; text: string }>;
};

export function formatMeetingNotesExport({
  roomLabel,
  summary,
  smartHighlights = [],
}: FormatMeetingNotesExportInput): string {
  const sections = [
    `Meeting Notes: ${roomLabel}`,
    "",
    "Summary",
    summary.summary || "No concise summary available.",
    "",
    "Key Points",
    ...(summary.keyPoints.length > 0 ? summary.keyPoints.map((item) => `- ${item}`) : ["- None"]),
    "",
    "Action Items",
    ...(summary.actionItems.length > 0 ? summary.actionItems.map((item) => `- ${item}`) : ["- None"]),
  ];

  if (smartHighlights.length > 0) {
    sections.push(
      "",
      "Smart Highlights",
      ...smartHighlights.map((item) => `- ${item.speakerName}: ${item.text}`),
    );
  }

  return sections.join("\n");
}