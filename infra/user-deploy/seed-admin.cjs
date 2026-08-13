/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

const root = "/home/yty/blog/source";
const { Algorithm, hash } = require(path.join(root, "node_modules/@node-rs/argon2"));
const { Client } = require(path.join(root, "node_modules/pg"));

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 15) {
    throw new Error("ADMIN_EMAIL and a 15+ character ADMIN_PASSWORD are required");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const existing = await client.query("SELECT role FROM users WHERE email = $1 LIMIT 1", [email]);
    if (existing.rowCount) {
      if (existing.rows[0].role !== "admin") {
        throw new Error(`ADMIN_EMAIL already belongs to a ${existing.rows[0].role} account`);
      }
      process.stdout.write(`Admin already exists; password left unchanged: ${email}\n`);
      return;
    }

    const passwordHash = await hash(password.normalize("NFC"), {
      algorithm: Algorithm.Argon2id,
      memoryCost: Number(process.env.ARGON2_MEMORY_COST || 19456),
      timeCost: Number(process.env.ARGON2_TIME_COST || 2),
      parallelism: Number(process.env.ARGON2_PARALLELISM || 1),
      outputLen: 32,
    });
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, mfa_required_after)
       VALUES ($1, $2, $3, 'admin', now() + interval '7 days')`,
      ["管理员", email, passwordHash],
    );
    process.stdout.write(`Admin created: ${email}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
