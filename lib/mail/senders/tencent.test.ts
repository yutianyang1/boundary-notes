import assert from "node:assert/strict";
import test from "node:test";
import type { SendEmailRequest } from "tencentcloud-sdk-nodejs-ses/tencentcloud/services/ses/v20201002/ses_models";
import { MailSenderError } from "../sender";
import { classifyTencentError, createTencentSender } from "./tencent";

test("Tencent sender maps a normalized mail to SendEmail template fields", async () => {
  const previous = snapshot();
  Object.assign(process.env, {
    MAIL_FROM_ADDRESS: "noreply@mail.xiudou.site",
    MAIL_FROM_NAME: "边界笔记",
    MAIL_REPLY_TO: "hello@xiudou.site",
    SES_TEMPLATE_POST_PUBLISHED: "100091",
    SES_TEMPLATE_PASSWORD_RESET: "100090",
    SES_TEMPLATE_SECURITY_ALERT: "100092",
  });
  let request: SendEmailRequest | undefined;
  const sender = createTencentSender({
    async SendEmail(value) {
      request = value;
      return { RequestId: "req-1", MessageId: "message-1" };
    },
  });
  try {
    await sender.send({
      to: "reader@example.test",
      template: "post_published",
      subject: "新文章",
      vars: {
        postTitle: "新文章",
        postSummary: "A & B < C",
        postUrl: "https://xiudou.site/posts/new?a=1&b=2",
        unsubscribeUrl: "https://xiudou.site/unsubscribe?id=1&token=abc",
      },
      headers: { "List-Unsubscribe": "<https://xiudou.site/api/subscriptions/unsubscribe?id=1&token=abc>" },
    });
    assert.equal(request?.FromEmailAddress, "边界笔记 <noreply@mail.xiudou.site>");
    assert.deepEqual(request?.Destination, ["reader@example.test"]);
    assert.equal(request?.Template?.TemplateID, 100091);
    assert.deepEqual(JSON.parse(request?.Template?.TemplateData ?? ""), {
      postTitle: "新文章",
      postSummary: "A &amp; B &lt; C",
      postUrl: "https://xiudou.site/posts/new?a=1&amp;b=2",
      unsubscribeUrl: "https://xiudou.site/unsubscribe?id=1&amp;token=abc",
    });
    assert.equal(request?.ReplyToAddresses, "hello@xiudou.site");
    assert.deepEqual(JSON.parse(request?.SmtpHeaders ?? ""), {
      "List-Unsubscribe": "<https://xiudou.site/api/subscriptions/unsubscribe?id=1&token=abc>",
    });
    assert.equal(request?.TriggerType, 0);
    assert.equal(request?.Unsubscribe, "0");

    await sender.send({
      to: "reader@example.test",
      template: "password_reset",
      subject: "重置密码",
      vars: { resetUrl: "https://xiudou.site/reset-password?token=abc" },
    });
    assert.equal(request?.Template?.TemplateID, 100090);
    assert.equal(request?.TriggerType, 1);
    assert.equal(request?.SmtpHeaders, undefined);

    await sender.send({
      to: "reader@example.test",
      template: "security_alert",
      subject: "安全提醒",
      vars: {
        actionLabel: "密码已修改",
        occurredAt: "2026-08-04 15:30",
        deviceName: "Chrome · Windows",
        accountUrl: "https://xiudou.site/account",
      },
    });
    assert.equal(request?.Template?.TemplateID, 100092);
    assert.equal(request?.TriggerType, 1);
    assert.equal(request?.SmtpHeaders, undefined);
  } finally {
    restore(previous);
  }
});

test("Tencent error classification distinguishes permanent configuration failures", () => {
  const permanent = classifyTencentError({
    code: "FailedOperation.InvalidTemplateID",
    message: "template invalid",
    requestId: "req-permanent",
  });
  assert.equal(permanent instanceof MailSenderError, true);
  assert.equal(permanent.retryable, false);
  assert.equal(permanent.requestId, "req-permanent");
  assert.equal(classifyTencentError({ code: "RequestLimitExceeded", message: "slow down" }).retryable, true);
  assert.equal(classifyTencentError({ code: "FailedOperation.ExceedSendLimit", message: "daily limit" }).retryable, true);
  assert.equal(classifyTencentError({ code: "LimitExceeded", message: "quota exhausted" }).retryable, true);
  assert.equal(classifyTencentError({ code: "InternalError", message: "temporary" }).retryable, true);
});

test("Tencent frequency limits remain retryable", () => {
  assert.equal(classifyTencentError({ code: "FailedOperation.ExceedSendLimit", message: "slow down" }).retryable, true);
  assert.equal(classifyTencentError({ code: "LimitExceeded", message: "slow down" }).retryable, true);
});

const names = [
  "MAIL_FROM_ADDRESS",
  "MAIL_FROM_NAME",
  "MAIL_REPLY_TO",
  "SES_TEMPLATE_POST_PUBLISHED",
  "SES_TEMPLATE_PASSWORD_RESET",
  "SES_TEMPLATE_SECURITY_ALERT",
] as const;
function snapshot() {
  return Object.fromEntries(names.map((name) => [name, process.env[name]])) as Record<(typeof names)[number], string | undefined>;
}
function restore(values: ReturnType<typeof snapshot>) {
  for (const name of names) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
}
