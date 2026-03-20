import { canWorkspaceUseFeature } from "@/src/lib/billing";
import {
  replaceMeetingTasks,
  saveMeetingSummary,
  upsertMeetingSearchDocument,
} from "@/src/lib/repositories/meetingSummaryRepository";
import { generateMeetingSummary } from "@/src/lib/ai/meetingSummary";
import { extractMeetingTasks } from "@/src/lib/ai/taskExtraction";
import type { MeetingSummaryResult } from "@/src/types/ai";
import type { ChatMessage, MeetingFileShare, TranscriptLine } from "@/src/types/meeting";

export type MeetingEndProcessInput = {
  workspaceId: string;
  actorUserId: string | null;
  roomId: string;
  transcript: string;
  transcriptLines: TranscriptLine[];
  chatMessages: ChatMessage[];
  fileShares: MeetingFileShare[];
  recordingPath: string | null;
};

export type MeetingEndProcessResult = {
  meetingId: string;
  summary: MeetingSummaryResult;
  extractedTasksCount: number;
};

export async function processMeetingEnd(input: MeetingEndProcessInput): Promise<MeetingEndProcessResult> {
  const aiEnabled = await canWorkspaceUseFeature(input.workspaceId, "ai");
  const summary: MeetingSummaryResult = aiEnabled
    ? await generateMeetingSummary(input.transcript)
    : {
        summary: input.transcript
          ? `Summary unavailable on current plan. Transcript captured with ${input.transcriptLines.length} lines.`
          : "Summary unavailable on current plan.",
        keyPoints: input.transcriptLines.slice(0, 3).map((line) => `${line.speakerName}: ${line.text}`),
        actionItems: [],
      };

  const meetingId = await saveMeetingSummary({
    workspaceId: input.workspaceId,
    roomId: input.roomId,
    summary,
    transcriptLines: input.transcriptLines,
    chatMessages: input.chatMessages,
    fileShares: input.fileShares,
    recordingPath: input.recordingPath,
    hostUserId: input.actorUserId,
  });

  const extractedTasks = aiEnabled
    ? await extractMeetingTasks({
        transcript: input.transcript,
        summary: summary.summary,
        actionItems: summary.actionItems,
      })
    : [];

  await replaceMeetingTasks({
    workspaceId: input.workspaceId,
    meetingId,
    tasks: extractedTasks,
  });

  await upsertMeetingSearchDocument({
    workspaceId: input.workspaceId,
    meetingId,
    roomId: input.roomId,
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    actionItems: summary.actionItems,
    transcriptLines: input.transcriptLines.map((line) => ({
      speakerName: line.speakerName,
      text: line.text,
    })),
  });

  return {
    meetingId,
    summary,
    extractedTasksCount: extractedTasks.length,
  };
}
