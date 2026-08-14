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
});

test("设备描述不含任何语言相关的文案", () => {
  // 这个值会写进数据库，含中文的话英文站的设备列表会漏中文，
  // 而且是存量数据，改文案修不掉。
  assert.equal(describeDevice(null), null);
  assert.equal(describeDevice(""), null);
  assert.equal(describeDevice("Mozilla/5.0 (X11; SomethingUnheardOf)"), null);
});

test("只认出一半时给出认出的那半", () => {
  assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0) SomeUnknownBrowser/1.0"), "Windows");
  assert.equal(describeDevice("Mozilla/5.0 (FutureOS) Chrome/126.0"), "Chrome");
});

test("accepts only valid proxy IP values", () => {
  assert.equal(extractClientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(extractClientIp(new Headers({ "x-real-ip": "not-an-ip" })), null);
});
