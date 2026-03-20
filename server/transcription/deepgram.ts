import WebSocket from "ws";

import type { SpeechStream, SpeechToTextService, TranscriptCallbacks } from "./types";

export class DeepgramSpeechToTextService implements SpeechToTextService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  createStream(callbacks: TranscriptCallbacks): SpeechStream {
    const ws = new WebSocket(
      "wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1",
      {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      },
    );

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as {
          is_final?: boolean;
          channel?: { alternatives?: Array<{ transcript?: string }> };
        };

        const text = data.channel?.alternatives?.[0]?.transcript?.trim() || "";
        if (!text) {
          return;
        }

        callbacks.onTranscript({
          text,
          isFinal: Boolean(data.is_final),
        });
      } catch (error) {
        callbacks.onError?.(error as Error);
      }
    });

    ws.on("error", (error) => {
      callbacks.onError?.(error as Error);
    });

    return {
      sendAudio: (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      },
      close: () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      },
    };
  }
}
