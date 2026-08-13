import { desc, eq } from "drizzle-orm";
import { validateRegisteredSession } from "../../lib/auth/session-registry";
import { db } from "../../lib/db";
import { userSessions, users } from "../../lib/db/schema";

async function main() {
  const [row] = await db
    .select({ jti: userSessions.jti, userId: userSessions.userId })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(eq(users.email, process.env.ADMIN_EMAIL!))
    .orderBy(desc(userSessions.createdAt))
    .limit(1);

  if (!row) throw new Error("No registered session found");
  const state = await validateRegisteredSession(row.userId, row.jti);
  if (!state) throw new Error("Latest registered session did not validate");
  process.stdout.write(`Session registry valid for role=${state.role}\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
