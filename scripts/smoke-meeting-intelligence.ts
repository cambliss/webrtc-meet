import { randomUUID } from "node:crypto";

import { Pool } from "pg";

type LoginResponse = {
  success?: boolean;
  error?: string;
};

type EndMeetingResponse = {
  error?: string;
  roomId?: string;
  meetingId?: string;
  extractedTasksCount?: number;
};

type TasksResponse = {
  tasks?: Array<{ id: string; title: string; status: string }>;
  error?: string;
};

type SearchResponse = {
  count?: number;
  results?: Array<{ meetingId: string; roomId: string; snippet: string }>;
  error?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function assertDbSchema(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const tableResult = await pool.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('meeting_tasks', 'meeting_search_documents')
      ORDER BY table_name ASC
      `,
    );

    const tables = new Set(tableResult.rows.map((row) => row.table_name));
    if (!tables.has("meeting_tasks") || !tables.has("meeting_search_documents")) {
      throw new Error("Missing required meeting intelligence tables. Run DB migrations/schema.sql first.");
    }

    const indexResult = await pool.query<{ indexname: string }>(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'meeting_search_documents'
      `,
    );

    const hasGin = indexResult.rows.some((row) => row.indexname.includes("tsv"));
    if (!hasGin) {
      throw new Error("Missing GIN/tsvector index for meeting_search_documents.");
    }
  } finally {
    await pool.end();
  }
}

function extractMeetingCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("Login did not return Set-Cookie header");
  }

  const candidate = setCookieHeader
    .split(",")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith("meeting_token="));

  if (!candidate) {
    throw new Error("meeting_token cookie not found");
  }

  return candidate.split(";")[0];
}

async function main() {
  const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const identifier = process.env.SMOKE_IDENTIFIER || "host";
  const password = process.env.SMOKE_PASSWORD || "host123";
  const databaseUrl = requiredEnv("DATABASE_URL");

  console.log("[smoke] checking DB schema...");
  await assertDbSchema(databaseUrl);

  console.log("[smoke] logging in...");
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  const loginPayload = (await loginRes.json().catch(() => ({}))) as LoginResponse;
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginPayload.error || loginRes.status}`);
  }

  const cookieHeader = extractMeetingCookie(loginRes.headers.get("set-cookie"));

  const roomId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const transcriptLines = [
    {
      id: randomUUID(),
      roomId,
      socketId: "smoke-host",
      speakerName: "Host",
      text: "Ravi: finalize pricing update by 2026-04-02",
      isFinal: true,
      createdAt: Date.now() - 4000,
    },
    {
      id: randomUUID(),
      roomId,
      socketId: "smoke-participant",
      speakerName: "Participant",
      text: "Please create launch checklist and assign QA owner",
      isFinal: true,
      createdAt: Date.now() - 2000,
    },
  ];

  console.log("[smoke] calling end-meeting pipeline...");
  const endRes = await fetch(`${baseUrl}/api/meetings/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      roomId,
      transcriptLines,
      transcript: transcriptLines.map((line) => `${line.speakerName}: ${line.text}`).join("\n"),
      chatMessages: [],
      fileShares: [],
    }),
  });

  const endPayload = (await endRes.json().catch(() => ({}))) as EndMeetingResponse;
  if (!endRes.ok || !endPayload.meetingId) {
    throw new Error(`End meeting failed: ${endPayload.error || endRes.status}`);
  }

  console.log("[smoke] fetching extracted tasks...");
  const tasksRes = await fetch(`${baseUrl}/api/meetings/${encodeURIComponent(endPayload.meetingId)}/tasks`, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
    },
  });

  const tasksPayload = (await tasksRes.json().catch(() => ({}))) as TasksResponse;
  if (!tasksRes.ok || !Array.isArray(tasksPayload.tasks)) {
    throw new Error(`Tasks API failed: ${tasksPayload.error || tasksRes.status}`);
  }

  console.log("[smoke] running meeting search...");
  const searchRes = await fetch(`${baseUrl}/api/meetings/search?q=pricing`, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
    },
  });

  const searchPayload = (await searchRes.json().catch(() => ({}))) as SearchResponse;
  if (!searchRes.ok || !Array.isArray(searchPayload.results)) {
    throw new Error(`Search API failed: ${searchPayload.error || searchRes.status}`);
  }

  const foundMeeting = searchPayload.results.some((result) => result.meetingId === endPayload.meetingId);

  console.log("\n[smoke] PASS");
  console.log(`  meetingId: ${endPayload.meetingId}`);
  console.log(`  extractedTasksCount: ${endPayload.extractedTasksCount ?? tasksPayload.tasks.length}`);
  console.log(`  tasksReturned: ${tasksPayload.tasks.length}`);
  console.log(`  searchResults: ${searchPayload.count ?? searchPayload.results.length}`);
  console.log(`  searchContainsCreatedMeeting: ${foundMeeting}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[smoke] FAIL: ${message}`);
  process.exit(1);
});
