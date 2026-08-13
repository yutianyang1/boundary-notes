import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const WINDOW_SECONDS = 60 * 60;
const IP_LIMIT = 5;
// 每小时上限是外层兜底；正常使用下真正起作用的是下面的 60 秒冷却。
// 放宽到 5 是为了给「前几封都进了垃圾箱」的用户留出重试余地。
const EMAIL_LIMIT = 5;

/** 同一邮箱两封验证邮件之间的最短间隔。 */
export const RESEND_COOLDOWN_SECONDS = 60;

const quotaScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

// 获取冷却锁：拿到返回 0，已存在返回剩余秒数。
const cooldownScript = `
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then return 0 end
return redis.call('TTL', KEYS[1])
`;

/** allowRegistrationRequest 只用到 eval，抽出接口便于注入测试替身。 */
export type RateLimitRedis = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

function key(kind: "ip" | "email" | "cooldown", value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `register:${kind}:${digest}`;
}

export function areRegistrationCountsAllowed(ipCount: number, emailCount: number) {
  return ipCount <= IP_LIMIT && emailCount <= EMAIL_LIMIT;
}

/**
 * TTL 可能返回 -1（无过期）或 -2（键刚好过期），都当作「可以重发」。
 * 其余值夹到 [1, 冷却时长] 之间，避免把异常值透给用户。
 */
export function normalizeRetryAfter(ttl: number, fallback = RESEND_COOLDOWN_SECONDS) {
  if (!Number.isFinite(ttl) || ttl <= 0) return 0;
  return Math.min(Math.ceil(ttl), fallback);
}

export type RegistrationGate =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "quota" | "unavailable"; retryAfterSeconds: number };

export async function allowRegistrationRequest(
  ip: string | null,
  email: string,
  client?: RateLimitRedis | null,
): Promise<RegistrationGate> {
  try {
    const redis = client ?? await getRedis();
    if (!redis) throw new Error("Redis is unavailable");

    const consume = async (keyName: string) => Number(await redis.eval(quotaScript, {
      keys: [keyName],
      arguments: [String(WINDOW_SECONDS)],
    }));

    // 先过冷却闸。挡在这里的请求不消耗每小时配额，
    // 否则连点两下就白白烧掉一次额度。
    const ttl = normalizeRetryAfter(Number(await redis.eval(cooldownScript, {
      keys: [key("cooldown", email)],
      arguments: [String(RESEND_COOLDOWN_SECONDS)],
    })));
    if (ttl > 0) return { allowed: false, reason: "cooldown", retryAfterSeconds: ttl };

    const [ipCount, emailCount] = await Promise.all([
      consume(key("ip", ip ?? "unknown")),
      consume(key("email", email)),
    ]);
    if (!areRegistrationCountsAllowed(ipCount, emailCount)) {
      return { allowed: false, reason: "quota", retryAfterSeconds: WINDOW_SECONDS };
    }
    return { allowed: true };
  } catch {
    // 注册会发信并落库，Redis 不可用时一律拒绝。
    return { allowed: false, reason: "unavailable", retryAfterSeconds: RESEND_COOLDOWN_SECONDS };
  }
}
