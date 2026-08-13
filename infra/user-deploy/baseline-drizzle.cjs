/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const root = process.env.BLOG_SOURCE_ROOT || "/home/yty/blog/source";
const { Client } = require(path.join(root, "node_modules/pg"));

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const [{ count }] = (await client.query(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
    )).rows;
    const [{ users_exists: usersExists }] = (await client.query(
      "SELECT to_regclass('public.users') IS NOT NULL AS users_exists",
    )).rows;
    if (count !== 0 || !usersExists) return;

    const journal = JSON.parse(await readFile(path.join(root, "drizzle/meta/_journal.json"), "utf8"));
    const baseline = journal.entries.find((entry) => entry.idx === 0);
    if (!baseline) throw new Error("Drizzle baseline migration is missing");
    const sql = await readFile(path.join(root, "drizzle", `${baseline.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ($1, $2)",
      [hash, baseline.when],
    );
    process.stdout.write(`Recorded existing schema as Drizzle baseline: ${baseline.tag}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
