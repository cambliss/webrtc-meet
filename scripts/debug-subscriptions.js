require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rows = await client.query(`
    SELECT s.workspace_id, s.plan_id, s.status, s.razorpay_order_id, s.razorpay_payment_id, s.start_date, s.end_date, s.created_at
    FROM subscriptions s
    ORDER BY s.created_at DESC
    LIMIT 30
  `);

  console.log(rows.rows);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
