export type MeetingSummaryResult = {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
};

export type MeetingSummaryRequest = {
  transcript: string;
};
