require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

const WORKSPACE_ID = "workspace-19962fd0-5906-4e0d-99f2-ddb2fe9f64b7";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query("BEGIN");
  await client.query(
    `
    UPDATE subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE workspace_id = $1 AND status = 'active'
    `,
    [WORKSPACE_ID],
  );

  await client.query(
    `
    WITH latest_pending AS (
      SELECT id
      FROM subscriptions
      WHERE workspace_id = $1
        AND plan_id = 'enterprise'
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    )
    UPDATE subscriptions
    SET
      status = 'active',
      start_date = NOW(),
      end_date = NOW() + INTERVAL '30 days',
      updated_at = NOW()
    WHERE id IN (SELECT id FROM latest_pending)
    `,
    [WORKSPACE_ID],
  );

  const rows = await client.query(
    `
    SELECT workspace_id, plan_id, status, start_date, end_date, created_at
    FROM subscriptions
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    LIMIT 5
    `,
    [WORKSPACE_ID],
  );

  await client.query("COMMIT");
  console.log(rows.rows);
  await client.end();
}

main().catch(async (err) => {
  console.error(err.message || err);
  process.exit(1);
});
