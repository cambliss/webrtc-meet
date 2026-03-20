import { Pool } from "pg";

function getCookieValue(headers: Headers): string | null {
  const raw = headers.get("set-cookie");
  if (!raw) {
    return null;
  }

  const match = raw.match(/meeting_token=[^;]+/i);
  return match ? match[0] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = (process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const loginResponse = await fetch(`${baseUrl}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "host", password: "host123" }),
    redirect: "follow",
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed with status ${loginResponse.status}`);
  }

  const cookie = getCookieValue(loginResponse.headers);
  if (!cookie) {
    throw new Error("Login response did not include meeting_token cookie");
  }

  const now = Date.now();
  const roomId = `queue-test-${now}`;
  const idempotencyKey = `queue-test-${now}`;
  const payload = {
    roomId,
    transcriptLines: [
      {
        id: crypto.randomUUID(),
        roomId,
        socketId: "test-host",
        speakerName: "Host",
        text: "Please finalize the rollout checklist by next week.",
        isFinal: true,
        createdAt: now - 2000,
      },
      {
        id: crypto.randomUUID(),
        roomId,
        socketId: "test-participant",
        speakerName: "Participant",
        text: "I will review the budget and send updates tomorrow.",
        isFinal: true,
        createdAt: now - 1000,
      },
    ],
    chatMessages: [],
    fileShares: [],
  };

  const endResponse = await fetch(`${baseUrl}/api/meetings/end/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  const endBody = await endResponse.json().catch(() => ({}));

  await sleep(2500);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const meetingResult = await pool.query<{ id: string; room_id: string; status: string }>(
      `
      SELECT id::text, room_id, status
      FROM meetings
      WHERE room_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [roomId],
    );

    const jobResult = await pool.query<{ id: string; status: string; attempts: number; last_error: string | null }>(
      `
      SELECT id::text, status, attempts, last_error
      FROM background_jobs
      WHERE payload->>'roomId' = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [roomId],
    );

    process.stdout.write(
      JSON.stringify(
        {
          baseUrl,
          roomId,
          endStatus: endResponse.status,
          endBody,
          job: jobResult.rows[0] || null,
          meeting: meetingResult.rows[0] || null,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
