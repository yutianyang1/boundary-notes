import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { encryptOutboxPayload } from "./outbox";
import {
  attemptsAfterMailFailure,
  nextMailAttemptAt,
  normalizeMail,
  renderMail,
  safeError,
  shouldTerminateMail,
} from "./worker";
import { MailSenderError } from "./sender";

test("subscription mail templates render text, HTML, escaped values, and unsubscribe headers", () => {
  const previous = process.env.MAIL_OUTBOX_KEY;
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.MAIL_OUTBOX_KEY = randomBytes(32).toString("base64");
  // 邮件链接现在做同源校验,测试数据用的是 example.test,站点地址要跟着对齐。
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  try {
    const confirm = renderMail(mail("subscribe_confirm", { confirmUrl: "https://example.test/confirm?token=abc" }));
    assert.match(confirm.text, /24 小时/);
    assert.match(confirm.html, /确认邮件订阅/);

    const verify = normalizeMail(mail("verify_email", {
      name: "读者",
      verifyUrl: "https://example.test/verify?token=abc",
    }));
    assert.deepEqual(verify.vars, {
      name: "读者",
      verifyPath: "verify?token=abc",
    });
    // 模板写的是 https://xiudou.site/{{verifyPath}},所以变量既不能带 origin,
    // 也不能带前导斜杠——否则会拼出 site//verify 这种双斜杠地址。
    assert.doesNotMatch(verify.vars.verifyPath, /example\.test/);
    assert.equal(verify.vars.verifyPath.startsWith("/"), false);

    const reset = renderMail(mail("password_reset", { resetUrl: "https://example.test/reset-password?token=abc" }));
    assert.match(reset.text, /60 分钟/);
    assert.match(reset.html, /重置密码/);
    assert.throws(() => normalizeMail(mail("password_reset", { resetUrl: "javascript:alert(1)" })), /site origin/);
    assert.throws(() => normalizeMail(mail("password_reset", { resetUrl: "https://evil.test/reset" })), /site origin/);

    const security = renderMail(mail("security_alert", {
      actionLabel: "密码已重置",
      occurredAt: "2026-08-04 15:30",
      deviceName: "Chrome · Windows",
      accountUrl: "https://example.test/account",
    }));
    assert.match(security.text, /Chrome · Windows/);
    assert.match(security.html, /2026-08-04 15:30/);
    assert.equal(security.headers, undefined);
    assert.doesNotMatch(security.text, /192\.0\.2\./);
    assert.throws(() => normalizeMail(mail("security_alert", {
      actionLabel: "密码已修改",
      occurredAt: "2026-08-04 15:30",
      deviceName: "未知设备",
      accountUrl: "file:///etc/passwd",
    })), /site origin/);

    const published = renderMail(mail("post_published", {
      postTitle: "<script>alert(1)</script>\r\nBcc: victim@example.test",
      postSummary: "A & B",
      postUrl: "https://example.test/posts/demo",
      unsubscribeUrl: "https://example.test/unsubscribe?id=1&token=abc",
      oneClickUnsubscribeUrl: "https://example.test/api/subscriptions/unsubscribe?id=1&token=abc",
    }));
    assert.doesNotMatch(published.html, /<script>/);
    assert.match(published.html, /&lt;script&gt;/);
    assert.match(published.html, /A &amp; B/);
    assert.equal(published.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(published.headers?.["List-Unsubscribe"] ?? "", /^<https:\/\//);
    assert.match(published.headers?.["List-Unsubscribe"] ?? "", /api\/subscriptions\/unsubscribe/);
    const normalized = normalizeMail(mail("post_published", {
      postTitle: "标题\r\nBcc: victim@example.test",
      postSummary: "摘要",
      postUrl: "https://example.test/posts/demo",
      unsubscribeUrl: "https://example.test/unsubscribe?id=1&token=abc",
    }));
    assert.equal(normalized.subject.includes("\r"), false);
    assert.equal(normalized.subject.includes("\n"), false);
    assert.throws(() => normalizeMail(mail("post_published", {
      postTitle: "标题",
      postSummary: "摘要",
      postUrl: "javascript:alert(1)",
      unsubscribeUrl: "https://example.test/unsubscribe",
    })), /site origin/);
    assert.throws(() => renderMail(mail("unknown", {})), /Unknown mail template/);

    const permanent = new MailSenderError("bad template https://secret.test/token", false, "FailedOperation.InvalidTemplateID", "req-123");
    assert.equal(shouldTerminateMail(permanent, 1), true);
    assert.match(safeError(permanent), /RequestId: req-123/);
    assert.doesNotMatch(safeError(permanent), /secret\.test/);
    assert.equal(shouldTerminateMail(new Error("network"), 1), false);
    assert.equal(shouldTerminateMail(new Error("network"), 5), true);
    const dailyLimit = new MailSenderError("daily limit", true, "FailedOperation.ExceedSendLimit", "req-daily");
    assert.equal(shouldTerminateMail(dailyLimit, 5), false);
    assert.equal(shouldTerminateMail(dailyLimit, 7), false);
    assert.equal(attemptsAfterMailFailure(dailyLimit, 5), 4);
    assert.equal(attemptsAfterMailFailure(dailyLimit, 0), 0);
    assert.equal(attemptsAfterMailFailure(new Error("network"), 5), 5);
    let persistedAttempts = 0;
    for (let day = 0; day < 5; day += 1) {
      persistedAttempts = attemptsAfterMailFailure(dailyLimit, persistedAttempts + 1);
    }
    assert.equal(persistedAttempts, 0);
    assert.equal(shouldTerminateMail(new Error("network"), persistedAttempts + 1), false);
    assert.equal(
      nextMailAttemptAt(dailyLimit, 1, new Date("2026-08-04T08:00:00.000Z")).toISOString(),
      "2026-08-04T16:05:00.000Z",
    );
  } finally {
    if (previous === undefined) delete process.env.MAIL_OUTBOX_KEY;
    else process.env.MAIL_OUTBOX_KEY = previous;
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

function mail(template: string, payload: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    template,
    recipient: "reader@example.test",
    payload_enc: encryptOutboxPayload(payload),
    attempts: 1,
  };
}
