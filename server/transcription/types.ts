export type TranscriptChunk = {
  text: string;
  isFinal: boolean;
};

export type TranscriptCallbacks = {
  onTranscript: (chunk: TranscriptChunk) => void;
  onError?: (error: Error) => void;
};

export type SpeechStream = {
  sendAudio: (chunk: Buffer) => void;
  close: () => void;
};

export type SpeechToTextService = {
  createStream: (callbacks: TranscriptCallbacks) => SpeechStream;
};
