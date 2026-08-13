import assert from "node:assert/strict";
import test from "node:test";
import { describeDevice, extractClientIp } from "./device";

test("describes common browser and operating system combinations", () => {
  assert.equal(
    describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"),
    "Chrome · Windows",
  );
  assert.equal(
    describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15"),
    "Safari · macOS",
  );
  assert.equal(describeDevice(null), "未知设备");
});

test("accepts only valid proxy IP values", () => {
  assert.equal(extractClientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(extractClientIp(new Headers({ "x-real-ip": "not-an-ip" })), null);
});
