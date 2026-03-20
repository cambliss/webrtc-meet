import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const jobs = await pool.query(
      `
      SELECT id::text, job_type, status, attempts, last_error, created_at, updated_at
      FROM background_jobs
      ORDER BY created_at DESC
      LIMIT 5
      `,
    );

    const meetings = await pool.query(
      `
      SELECT id::text, room_id, status, created_at, ended_at
      FROM meetings
      ORDER BY created_at DESC
      LIMIT 5
      `,
    );

    process.stdout.write(
      JSON.stringify(
        {
          jobs: jobs.rows,
          meetings: meetings.rows,
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
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
