import assert from "node:assert/strict";
import test from "node:test";
import { securityAlertPayload } from "./security-alert";

test("security alert contains Shanghai time and device, but no IP", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://xiudou.site";
  try {
    const headers = new Headers({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      "x-real-ip": "192.0.2.10",
    });
    const payload = securityAlertPayload(headers, "密码已修改", new Date("2026-08-04T07:30:00.000Z"));
    assert.deepEqual(payload, {
      actionLabel: "密码已修改",
      occurredAt: "2026-08-04 15:30",
      deviceName: "Chrome · Windows",
      accountUrl: "https://xiudou.site/account",
    });
    assert.equal(
      securityAlertPayload(headers, "密码已重置", new Date("2026-08-04T07:30:00.000Z"), "/en/account").accountUrl,
      "https://xiudou.site/en/account",
    );
    assert.doesNotMatch(JSON.stringify(payload), /192\.0\.2\.10/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
