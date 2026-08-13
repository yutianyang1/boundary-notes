import assert from "node:assert/strict";
import test from "node:test";
import {
  allowRegistrationRequest,
  areRegistrationCountsAllowed,
  normalizeRetryAfter,
  RESEND_COOLDOWN_SECONDS,
  type RateLimitRedis,
} from "./registration-rate-limit";

test("registration limits both IP and email dimensions", () => {
  assert.equal(areRegistrationCountsAllowed(5, 5), true);
  assert.equal(areRegistrationCountsAllowed(6, 1), false);
  assert.equal(areRegistrationCountsAllowed(1, 6), false);
});

test("resend cooldown is at least a minute", () => {
  assert.ok(RESEND_COOLDOWN_SECONDS >= 60);
});

test("normalizeRetryAfter treats missing expiry as sendable", () => {
  // Redis TTL 约定：-2 键不存在，-1 键无过期时间。
  assert.equal(normalizeRetryAfter(-2), 0);
  assert.equal(normalizeRetryAfter(-1), 0);
  assert.equal(normalizeRetryAfter(0), 0);
});

test("normalizeRetryAfter rounds up and clamps to the cooldown length", () => {
  assert.equal(normalizeRetryAfter(1), 1);
  assert.equal(normalizeRetryAfter(12.2), 13);
  assert.equal(normalizeRetryAfter(60), 60);
  // 异常大的 TTL 不该透给用户。
  assert.equal(normalizeRetryAfter(3_600), RESEND_COOLDOWN_SECONDS);
});

test("normalizeRetryAfter rejects non-finite input", () => {
  assert.equal(normalizeRetryAfter(Number.NaN), 0);
  assert.equal(normalizeRetryAfter(Number.POSITIVE_INFINITY), 0);
});

/**
 * 假客户端：第一个 eval 一定是冷却脚本，其后是配额脚本。
 * cooldownTtl 为 0 表示成功抢到冷却锁。
 */
function fakeRedis(cooldownTtl: number, quotaCounts: number[] = []): RateLimitRedis & { calls: string[][] } {
  const calls: string[][] = [];
  let quotaIndex = 0;
  return {
    calls,
    async eval(script, options) {
      calls.push(options.keys);
      if (script.includes("'SET'")) return cooldownTtl;
      return quotaCounts[quotaIndex++] ?? 1;
    },
  };
}

test("first send within cooldown window is allowed and consumes quota", async () => {
  const redis = fakeRedis(0, [1, 1]);
  const gate = await allowRegistrationRequest("203.0.113.9", "reader@example.test", redis);
  assert.deepEqual(gate, { allowed: true });
  // 冷却键 + IP 键 + 邮箱键。
  assert.equal(redis.calls.length, 3);
});

test("resend inside the cooldown is blocked with the remaining seconds", async () => {
  const redis = fakeRedis(41);
  const gate = await allowRegistrationRequest("203.0.113.9", "reader@example.test", redis);
  assert.deepEqual(gate, { allowed: false, reason: "cooldown", retryAfterSeconds: 41 });
});

test("cooldown rejection does not consume the hourly quota", async () => {
  const redis = fakeRedis(41);
  await allowRegistrationRequest("203.0.113.9", "reader@example.test", redis);
  // 只查了冷却键，没有碰配额计数器——连点两下不该烧掉额度。
  assert.equal(redis.calls.length, 1);
});

test("exceeding the hourly quota reports the quota reason", async () => {
  const overLimit = 6;
  const redis = fakeRedis(0, [1, overLimit]);
  const gate = await allowRegistrationRequest("203.0.113.9", "reader@example.test", redis);
  assert.equal(gate.allowed, false);
  assert.equal(gate.allowed === false && gate.reason, "quota");
});

test("redis failure fails closed rather than sending mail", async () => {
  const broken: RateLimitRedis = {
    async eval() { throw new Error("connection refused"); },
  };
  const gate = await allowRegistrationRequest("203.0.113.9", "reader@example.test", broken);
  assert.deepEqual(gate, {
    allowed: false,
    reason: "unavailable",
    retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
  });
});
