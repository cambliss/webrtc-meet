# MeetFlow - Video Conferencing Platform

Production-ready WebRTC conferencing starter built with Next.js App Router, TypeScript, Socket.io, and Zustand.

## Stack

- Next.js (App Router)
- TypeScript
- TailwindCSS
- WebRTC (`RTCPeerConnection`, ICE, Offer/Answer)
- Socket.io signaling server
- Zustand state management
- JWT authentication

## Project Structure

```text
/src
	/app
		/api
			/auth
				/login/route.ts
				/logout/route.ts
				/me/route.ts
			/meetings/route.ts
		/login/page.tsx
		/meeting/[id]/page.tsx
		/globals.css
		/layout.tsx
		/page.tsx
	/components
		ChatPanel.tsx
		JoinMeetingForm.tsx
		MeetingControls.tsx
		MeetingRoom.tsx
		VideoGrid.tsx
		VideoTile.tsx
	/hooks
		useWebRTC.ts
	/lib
		auth.ts
	/store
		meetingStore.ts
	/services
		socket.ts
	/types
		auth.ts
		meeting.ts
		socket.ts
/server
	signaling-server.ts
middleware.ts
```

## Features

- JWT login with protected meeting routes (`/meeting/:id`)
- Host and participant roles
- Create/join room by meeting ID
- Camera and microphone toggle
- Screen sharing
- Multi-participant mediasoup SFU architecture
- Simulcast video layers (low/medium/high)
- Adaptive video quality based on consumer score/bandwidth signals
- Active speaker prioritization
- Real-time chat (Socket.io)
- Server-side recording (mediasoup + FFmpeg)
- Responsive meeting UI with reusable components

## Demo Credentials

- Host: `host` / `host123`
- Participant: `participant` / `participant123`

## Run Locally

Install dependencies:

```bash
npm install
```

Start Next.js app:

```bash
npm run dev
```

Start signaling server in a second terminal:

```bash
npm run signaling:dev
```

## Environment Variables

Create `.env.local`:

```env
JWT_SECRET=replace-with-a-strong-secret
NEXT_PUBLIC_SIGNALING_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
CLIENT_ORIGIN=http://localhost:3000
SIGNALING_PORT=4000
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=49999
NEXT_PUBLIC_STUN_URL=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_URL=turn:your-turn-server
NEXT_PUBLIC_TURN_USERNAME=user
NEXT_PUBLIC_TURN_CREDENTIAL=pass
FFMPEG_PATH=ffmpeg
RECORDINGS_DIR=./recordings
DEEPGRAM_API_KEY=your-deepgram-api-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_SUMMARY_MODEL=gpt-4.1-mini
AI_SUMMARY_PROVIDER=openai
ANTHROPIC_API_KEY=your-claude-api-key
ANTHROPIC_SUMMARY_MODEL=claude-3-5-sonnet-latest
DATABASE_URL=postgresql://user:pass@localhost:5432/video_meeting_app
MEETING_END_USE_BACKGROUND_JOBS=false
BACKGROUND_JOB_POLL_MS=1500
BACKGROUND_WORKER_ID=worker-1
OBJECT_STORAGE_PROVIDER=local
OBJECT_STORAGE_S3_BUCKET=
OBJECT_STORAGE_S3_REGION=us-east-1
OBJECT_STORAGE_S3_ENDPOINT=
OBJECT_STORAGE_S3_ACCESS_KEY_ID=
OBJECT_STORAGE_S3_SECRET_ACCESS_KEY=
OBJECT_STORAGE_S3_FORCE_PATH_STYLE=false
OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS=300
OBJECT_STORAGE_S3_KEY_PREFIX=meetflow
SECURE_FILES_RETENTION_DAYS=30
SECURE_FILES_RETENTION_BATCH=500
RECORDINGS_RETENTION_DAYS=30
OBS_SERVICE_NAME=meetflow-next-api
RATE_LIMIT_STORE=memory
RATE_LIMIT_AUTH_LOGIN_PER_10_MIN=20
RATE_LIMIT_AUTH_SIGNUP_PER_10_MIN=8
RATE_LIMIT_AI_SUMMARY_PER_10_MIN=30
RATE_LIMIT_AI_TRANSLATE_PER_10_MIN=120
RATE_LIMIT_AI_SPEECH_PER_10_MIN=80
RATE_LIMIT_AI_TEXT_CHARS_PER_10_MIN=120000
RATE_LIMIT_SECURE_FILES_UPLOAD_PER_10_MIN=30
RATE_LIMIT_MEETING_END_PER_10_MIN=40
RATE_LIMIT_MEETING_END_TEXT_CHARS_PER_10_MIN=200000
IDEMPOTENCY_TTL_SECONDS=21600
FILE_SIGNATURE_STRICT=true
ALLOWED_UPLOAD_EXTENSIONS=.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.json,.zip,.webm,.mp4,.mp3,.wav
ALLOWED_UPLOAD_MIME_PREFIXES=image/,audio/,video/,text/,application/pdf,application/json,application/zip
SUPER_ADMIN_USER_IDS=user-123,user-456
SUPER_ADMIN_USERNAMES=securityadmin,opslead
```

## Idempotent Writes

- End meeting API and secure file upload API support optional `Idempotency-Key` headers.
- Repeating the same request with the same key returns the original stored response.
- Reusing a key with a different payload returns `409`.

## Background Jobs Dead-Letter Recovery

- List failed jobs (super-admin only):

`GET /api/admin/jobs/failed?limit=100`

- Retry a failed job (super-admin only):

`POST /api/admin/jobs/:jobId/retry`

## Global Rate Limit Store

- Default store is in-memory (`RATE_LIMIT_STORE=memory`).
- For multi-instance enforcement, set `RATE_LIMIT_STORE=postgres` and ensure schema is applied.

## Observability

- Structured logs are emitted as JSON from worker/runtime utilities.
- Super-admin metrics endpoint:

`GET /api/admin/metrics`

Returned metrics include:
- DB health
- process uptime/memory stats
- background job queue status and oldest pending age
- secure file stored bytes
- ended meetings count

## ICE (STUN/TURN) Configuration

WebRTC ICE servers are configured in `src/lib/iceServers.ts`.

Example:

```ts
iceServers: [
	{ urls: "stun:stun.l.google.com:19302" },
	{ urls: "turn:your-turn-server", username: "user", credential: "pass" },
]
```

For restricted enterprise networks, make sure:

- TURN server is reachable from clients.
- mediasoup server has correct `MEDIASOUP_ANNOUNCED_IP`.
- mediasoup UDP/TCP port range (`MEDIASOUP_MIN_PORT`-`MEDIASOUP_MAX_PORT`) is open.

## Server Recording Flow

- Host triggers `start-recording` over Socket.io.
- Server creates mediasoup plain transports and consumers for target audio/video producers.
- FFmpeg receives RTP via SDP and writes meeting file to `RECORDINGS_DIR`.
- `stop-recording` closes consumers/transports and finalizes recording.

## Real-time Transcription Flow

- Transcription runs on the Node.js SFU backend (`server/signaling-server.ts`).
- Backend creates audio plain transports/consumers per participant audio producer.
- FFmpeg converts RTP audio into PCM 16k mono.
- PCM stream is sent to Deepgram realtime STT over WebSocket.
- Server emits `transcript-line` events to room participants and stores transcript lines in room memory (`transcriptHistory`).

## AI Meeting Summary API

Endpoint:

`POST /api/ai/meeting-summary`

Request body:

```json
{
	"transcript": "full meeting transcript text"
}
```

Response JSON:

```json
{
	"summary": "...",
	"keyPoints": ["..."],
	"actionItems": ["..."]
}
```

## End-of-Meeting Summary Pipeline

1. Client collects final transcript lines when host leaves meeting.
2. Client sends transcript to `POST /api/meetings/end`.
3. Backend generates AI summary (`summary`, `keyPoints`, `actionItems`).
4. Backend stores summary in `meeting_summaries` (PostgreSQL).
5. Client redirects to `/meeting-history`, which reads and displays stored summaries.

## WebRTC Flow

1. User joins a room over Socket.io and receives mediasoup router RTP capabilities.
2. Client creates send and recv WebRTC transports via signaling callbacks.
3. Client produces local audio/video tracks to SFU.
4. SFU notifies peers about new producers.
5. Peers consume producer tracks via recv transport.
6. Remote tracks are aggregated by participant and rendered in `VideoGrid`.

`useWebRTC()` owns peer connection setup, media stream handling, signaling events, and cleanup.
