import assert from "node:assert/strict";
import test from "node:test";
import { shortDate } from "./short-date";

test("shortDate reads naturally in each locale", () => {
  const date = new Date("2026-08-27T02:00:00Z");
  assert.equal(shortDate(date, "zh"), "8月27日");
  assert.equal(shortDate(date, "en"), "Aug 27");
});

test("shortDate uses the author's Shanghai day, not UTC", () => {
  // UTC 8 月 26 日 18:00 已经是上海时间 8 月 27 日凌晨两点。
  assert.equal(shortDate(new Date("2026-08-26T18:00:00Z"), "zh"), "8月27日");
});
