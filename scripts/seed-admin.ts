import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { db, pool } from "../lib/db";
import { users } from "../lib/db/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 15) {
    throw new Error("ADMIN_EMAIL and a 15+ character ADMIN_PASSWORD are required");
  }

  const [existing] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    if (existing.role !== "admin") {
      throw new Error(`ADMIN_EMAIL already belongs to a ${existing.role} account`);
    }
    process.stdout.write(`Admin already exists; password left unchanged: ${email}\n`);
    return;
  }

  await db.insert(users).values({
    name: "管理员",
    email,
    passwordHash: await hashPassword(password),
    role: "admin",
    mfaRequiredAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
  });
  process.stdout.write(`Admin created: ${email}\n`);
}

main().finally(() => pool.end());
