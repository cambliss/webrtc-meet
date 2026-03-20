require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query("UPDATE plans SET price = $1 WHERE id = $2", [1, "enterprise"]);
  const result = await client.query("SELECT id, name, price FROM plans WHERE id = $1", ["enterprise"]);

  console.log(result.rows);
  await client.end();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
