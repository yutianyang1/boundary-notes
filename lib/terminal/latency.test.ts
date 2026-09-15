import assert from "node:assert/strict";
import test from "node:test";
import { formatServerTiming, parseServerTiming, percentile } from "./latency";

test("server timing round-trips through format and parse", () => {
  const header = formatServerTiming([
    { name: "auth", duration: 3.14159 },
    { name: "write", duration: 0.04 },
    { name: "total", duration: -1 },
  ]);
  assert.equal(header, "auth;dur=3.1, write;dur=0.0, total;dur=0.0");
  assert.deepEqual(parseServerTiming(header), { auth: 3.1, write: 0, total: 0 });
});

test("server timing parser skips malformed entries", () => {
  assert.deepEqual(parseServerTiming(null), {});
  assert.deepEqual(parseServerTiming("cache;desc=hit, auth;dur=abc, db;dur=12"), { db: 12 });
});

test("percentile uses nearest rank on unsorted samples", () => {
  const samples = [50, 10, 40, 20, 30];
  assert.equal(percentile(samples, 50), 30);
  assert.equal(percentile(samples, 95), 50);
  assert.equal(percentile(samples, 0), 10);
  assert.ok(Number.isNaN(percentile([], 50)));
});
