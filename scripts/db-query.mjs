import { Client } from "pg";

const sql = process.argv.slice(2).join(" ").trim();

if (!sql) {
  console.error('Usage: npm run db:query -- "select ..."');
  process.exit(1);
}

const forbidden =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|vacuum|reindex|copy)\b/i;

if (forbidden.test(sql)) {
  console.error("Blocked non-read-only SQL.");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.AGENT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const result = await client.query(sql);
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end();
}