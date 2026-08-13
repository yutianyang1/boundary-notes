import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSessions, users } from "@/lib/db/schema";
import { getRedis } from "@/lib/redis";

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const AUTH_CACHE_TTL_SECONDS = 60;

type SessionState = {
  name: string;
  email: string;
  image: string | null;
  role: "reader" | "author" | "editor" | "admin";
  emailVerified: Date | null;
  mfaEnabled: boolean;
  mfaRequiredAfter: Date | null;
  sessionVersion: number;
  disabledAt: Date | null;
  deletedAt: Date | null;
  expiresAt: Date;
  lastSeenWriteAt: Date;
};

function cacheKey(jti: string) {
  return `auth:session:v3:${jti}`;
}

type SessionMetadata = {
  ip?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
};

export async function createRegisteredSession(userId: string, metadata: SessionMetadata = {}) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1_000);
  await db.insert(userSessions).values({
    jti,
    userId,
    expiresAt,
    ip: metadata.ip ?? null,
    userAgent: metadata.userAgent?.slice(0, 2_048) ?? null,
    deviceName: metadata.deviceName?.slice(0, 160) ?? null,
  });
  return { jti, expiresAt };
}

export async function listActiveUserSessions(userId: string) {
  return db
    .select({
      jti: userSessions.jti,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
      expiresAt: userSessions.expiresAt,
      ip: userSessions.ip,
      userAgent: userSessions.userAgent,
      deviceName: userSessions.deviceName,
    })
    .from(userSessions)
    .where(and(
      eq(userSessions.userId, userId),
      isNull(userSessions.revokedAt),
      gt(userSessions.expiresAt, new Date()),
    ))
    .orderBy(desc(userSessions.lastSeenAt), desc(userSessions.createdAt));
}

export async function validateRegisteredSession(userId: string, jti: string) {
  const redis = await getRedis();
  if (redis) {
    const cached = await redis.get(cacheKey(jti)).catch(() => null);
    if (cached) {
      try {
        const value = JSON.parse(cached) as Omit<SessionState, "expiresAt" | "emailVerified" | "mfaRequiredAfter" | "disabledAt" | "deletedAt" | "lastSeenWriteAt"> & {
          expiresAt: string;
          emailVerified: string | null;
          mfaRequiredAfter: string | null;
          disabledAt: string | null;
          deletedAt: string | null;
          lastSeenWriteAt: string;
        };
        const state = {
          ...value,
          expiresAt: new Date(value.expiresAt),
          emailVerified: value.emailVerified ? new Date(value.emailVerified) : null,
          mfaRequiredAfter: value.mfaRequiredAfter ? new Date(value.mfaRequiredAfter) : null,
          disabledAt: value.disabledAt ? new Date(value.disabledAt) : null,
          deletedAt: value.deletedAt ? new Date(value.deletedAt) : null,
          lastSeenWriteAt: new Date(value.lastSeenWriteAt),
        };
        if (
          state.expiresAt.getTime() > Date.now() &&
          !state.disabledAt &&
          !state.deletedAt &&
          (state.role !== "reader" || state.emailVerified)
        ) {
          await touchRegisteredSession(jti, state, redis);
          return state;
        }
      } catch {
        // Ignore corrupt cache data and fall through to PostgreSQL.
      }
      await redis.del(cacheKey(jti)).catch(() => undefined);
    }
  }

  const [state] = await db
    .select({
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      emailVerified: users.emailVerified,
      mfaEnabled: users.mfaEnabled,
      mfaRequiredAfter: users.mfaRequiredAfter,
      sessionVersion: users.sessionVersion,
      disabledAt: users.disabledAt,
      deletedAt: users.deletedAt,
      expiresAt: userSessions.expiresAt,
      lastSeenWriteAt: userSessions.lastSeenWriteAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(
      eq(userSessions.jti, jti),
      eq(userSessions.userId, userId),
      isNull(userSessions.revokedAt),
      gt(userSessions.expiresAt, new Date()),
    ))
    .limit(1);

  if (!state || state.disabledAt || state.deletedAt || (state.role === "reader" && !state.emailVerified)) return null;
  await touchRegisteredSession(jti, state, redis);
  if (redis) {
    await redis.set(cacheKey(jti), JSON.stringify(state), { EX: AUTH_CACHE_TTL_SECONDS }).catch(() => undefined);
  }
  return state;
}

async function touchRegisteredSession(
  jti: string,
  state: SessionState,
  redis: Awaited<ReturnType<typeof getRedis>>,
) {
  const now = new Date();
  if (redis) {
    await redis.set(`auth:last-seen:${jti}`, now.toISOString(), {
      EX: SESSION_MAX_AGE_SECONDS,
    }).catch(() => undefined);
  }
  if (now.getTime() - state.lastSeenWriteAt.getTime() < 5 * 60_000) return;

  const acquired = redis
    ? await redis.set(`auth:touch:${jti}`, "1", { NX: true, EX: 5 * 60 }).catch(() => null)
    : "OK";
  if (!acquired) return;

  await db.update(userSessions).set({
    lastSeenAt: now,
    lastSeenWriteAt: now,
  }).where(and(
    eq(userSessions.jti, jti),
    isNull(userSessions.revokedAt),
  ));
  state.lastSeenWriteAt = now;
}

export async function revokeRegisteredSession(jti: string) {
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.jti, jti), isNull(userSessions.revokedAt)));
  await clearRegisteredSessionCache([jti]);
}

export async function revokeUserSession(userId: string, jti: string) {
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(userSessions.jti, jti),
      eq(userSessions.userId, userId),
      isNull(userSessions.revokedAt),
    ))
    .returning({ jti: userSessions.jti });
  if (revoked.length) await clearRegisteredSessionCache(revoked.map((row) => row.jti));
  return revoked.length === 1;
}

export async function revokeOtherUserSessions(userId: string, currentJti: string) {
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(userSessions.userId, userId),
      ne(userSessions.jti, currentJti),
      isNull(userSessions.revokedAt),
    ))
    .returning({ jti: userSessions.jti });
  if (revoked.length) await clearRegisteredSessionCache(revoked.map((row) => row.jti));
  return revoked.length;
}

export async function clearRegisteredSessionCache(jtis: string[]) {
  if (!jtis.length) return;
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(jtis.flatMap((jti) => [
    cacheKey(jti),
    `auth:last-seen:${jti}`,
    `auth:touch:${jti}`,
  ])).catch(() => undefined);
}

export async function invalidateUserSessionCache(userId: string) {
  const redis = await getRedis();
  if (!redis) return;
  const rows = await db.select({ jti: userSessions.jti }).from(userSessions).where(and(
    eq(userSessions.userId, userId),
    isNull(userSessions.revokedAt),
    gt(userSessions.expiresAt, new Date()),
  ));
  if (!rows.length) return;
  await clearRegisteredSessionCache(rows.map(({ jti }) => jti));
}
