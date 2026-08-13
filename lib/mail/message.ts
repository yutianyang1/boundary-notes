import { decryptOutboxPayload } from "@/lib/mail/outbox";

export type MailTemplate = "verify_email" | "subscribe_confirm" | "post_published" | "password_reset" | "security_alert";

export type ClaimedMail = {
  id: string;
  template: string;
  recipient: string;
  payload_enc: string;
  attempts: number;
};

export type NormalizedMail = {
  template: MailTemplate;
  subject: string;
  vars: Record<string, string>;
  headers?: Record<string, string>;
};

export function siteOrigin() {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").origin;
}

/**
 * 邮件里的链接一律拆成"硬编码域名 + 路径"两段:模板里写死 https://xiudou.site,
 * 变量只带路径。腾讯云模板审核要求能直接看出跳转目标,整条 URL 塞进变量会被判为
 * 链接过于宽泛而驳回。顺带把原来的协议校验收紧成同源校验——出站链接不该出现在
 * 这些事务邮件里。
 */
function safePath(value: unknown) {
  const origin = siteOrigin();
  const url = new URL(String(value), origin);
  if (url.origin !== origin) throw new Error("Mail link must stay on the site origin");
  // 去掉前导斜杠:模板里写的是 https://xiudou.site/{{xxxPath}},
  // 斜杠必须留在模板的硬编码部分,审核方才能看到域名是以 / 收尾的完整地址。
  return `${url.pathname}${url.search}`.replace(/^\//, "");
}

/** SMTP 通道仍然发完整 URL(本地开发指向 localhost),API 通道才用模板里的硬编码域名。 */
function absolute(path: string) {
  return `${siteOrigin()}/${path}`;
}

function safeSubject(value: unknown) {
  return String(value).replace(/[\r\n]+/g, " ").trim().slice(0, 240);
}

export function normalizeMail(mail: ClaimedMail): NormalizedMail {
  const payload = decryptOutboxPayload(mail.payload_enc);
  if (mail.template === "verify_email") {
    return {
      template: "verify_email",
      subject: "验证你的邮箱",
      vars: {
        name: String(payload.name ?? ""),
        verifyPath: safePath(payload.verifyUrl),
      },
    };
  }
  if (mail.template === "subscribe_confirm") {
    return {
      template: "subscribe_confirm",
      subject: "确认订阅边界笔记",
      vars: { confirmPath: safePath(payload.confirmUrl) },
    };
  }
  if (mail.template === "password_reset") {
    return {
      template: "password_reset",
      subject: "重置你的边界笔记密码",
      vars: { resetPath: safePath(payload.resetUrl) },
    };
  }
  if (mail.template === "security_alert") {
    return {
      template: "security_alert",
      subject: "边界笔记账号安全提醒",
      vars: {
        actionLabel: safeSubject(payload.actionLabel),
        occurredAt: String(payload.occurredAt ?? ""),
        deviceName: String(payload.deviceName ?? "未知设备"),
        accountPath: safePath(payload.accountUrl),
      },
    };
  }
  if (mail.template === "post_published") {
    const unsubscribePath = safePath(payload.unsubscribeUrl);
    const oneClickUnsubscribeUrl = absolute(safePath(payload.oneClickUnsubscribeUrl ?? payload.unsubscribeUrl));
    return {
      template: "post_published",
      subject: safeSubject(payload.postTitle),
      vars: {
        postTitle: safeSubject(payload.postTitle),
        postSummary: String(payload.postSummary ?? ""),
        postPath: safePath(payload.postUrl),
        unsubscribePath,
      },
      headers: {
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  }
  throw new Error(`Unknown mail template: ${mail.template}`);
}

export function renderNormalizedMail(mail: NormalizedMail) {
  if (mail.template === "verify_email") {
    return {
      subject: mail.subject,
      text: `你好，${mail.vars.name}。\n\n请打开下面的链接并点击确认：\n${absolute(mail.vars.verifyPath)}\n\n链接 24 小时内有效。`,
      html: `<p>你好，${escapeHtml(mail.vars.name)}。</p><p><a href="${escapeHtml(absolute(mail.vars.verifyPath))}">确认验证邮箱</a></p><p>链接 24 小时内有效。</p>`,
    };
  }
  if (mail.template === "subscribe_confirm") {
    return {
      subject: mail.subject,
      text: `请打开下面的链接确认订阅边界笔记：\n${absolute(mail.vars.confirmPath)}\n\n链接 24 小时内有效。如果你没有订阅过，忽略这封邮件即可。`,
      html: `<p>请点击下面的链接确认订阅边界笔记：</p><p><a href="${escapeHtml(absolute(mail.vars.confirmPath))}">确认邮件订阅</a></p><p>链接 24 小时内有效。如果你没有订阅过，忽略这封邮件即可。</p>`,
    };
  }
  if (mail.template === "password_reset") {
    return {
      subject: mail.subject,
      text: `请在 60 分钟内打开下面的链接重置密码：\n${absolute(mail.vars.resetPath)}\n\n如果不是你发起的请求，请忽略这封邮件。`,
      html: `<p>请在 60 分钟内点击下面的链接重置密码：</p><p><a href="${escapeHtml(absolute(mail.vars.resetPath))}">重置密码</a></p><p>如果不是你发起的请求，请忽略这封邮件。</p>`,
    };
  }
  if (mail.template === "security_alert") {
    return {
      subject: mail.subject,
      text: `${mail.vars.actionLabel}\n\n时间：${mail.vars.occurredAt}\n设备：${mail.vars.deviceName}\n\n如果不是你本人操作，请立即检查账户：${absolute(mail.vars.accountPath)}`,
      html: `<h1>${escapeHtml(mail.vars.actionLabel)}</h1><p>时间：${escapeHtml(mail.vars.occurredAt)}</p><p>设备：${escapeHtml(mail.vars.deviceName)}</p><p>如果不是你本人操作，请立即<a href="${escapeHtml(absolute(mail.vars.accountPath))}">检查账户</a>。</p>`,
    };
  }
  return {
    subject: mail.subject,
    text: `${mail.vars.postTitle}\n\n${mail.vars.postSummary}\n\n阅读全文：${absolute(mail.vars.postPath)}\n\n退订：${absolute(mail.vars.unsubscribePath)}`,
    html: `<h1>${escapeHtml(mail.vars.postTitle)}</h1><p>${escapeHtml(mail.vars.postSummary)}</p><p><a href="${escapeHtml(absolute(mail.vars.postPath))}">阅读全文</a></p><hr><p style="font-size:12px;color:#666"><a href="${escapeHtml(absolute(mail.vars.unsubscribePath))}">退订新文章通知</a></p>`,
    headers: mail.headers,
  };
}

export function renderMail(mail: ClaimedMail) {
  return renderNormalizedMail(normalizeMail(mail));
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
