import { ses } from "tencentcloud-sdk-nodejs-ses";
import type { SendEmailRequest } from "tencentcloud-sdk-nodejs-ses/tencentcloud/services/ses/v20201002/ses_models";
import type { MailSender, OutgoingMail } from "@/lib/mail/sender";
import { MailSenderError } from "@/lib/mail/sender";
import { escapeHtml } from "@/lib/mail/message";

type SesClient = { SendEmail(request: SendEmailRequest): Promise<unknown> };

const PERMANENT_ERROR_CODES = new Set([
  "FailedOperation.EmailAddrInBlacklist",
  "FailedOperation.EmailContentToolarge",
  "FailedOperation.IllegalURL",
  "FailedOperation.IncorrectEmail",
  "FailedOperation.IncorrectSender",
  "FailedOperation.InsufficientBalance",
  "FailedOperation.InsufficientQuota",
  "FailedOperation.InvalidTemplateID",
  "FailedOperation.MissingEmailContent",
  "FailedOperation.NotAuthenticatedSender",
  "FailedOperation.ProtocolCheckErr",
  "FailedOperation.ReceiverHasUnsubscribed",
  "FailedOperation.RejectedByRecipients",
  "FailedOperation.URLForbidden",
  "FailedOperation.UnsupportMailType",
  "FailedOperation.WithOutPermission",
  "FailedOperation.WrongContentJson",
  "InvalidParameter",
  "InvalidParameterValue",
  "MissingParameter",
  "OperationDenied",
  "ResourceInsufficient",
  "UnauthorizedOperation",
  "UnknownParameter",
  "UnsupportedOperation",
]);

let singletonClient: SesClient | undefined;
let singletonSender: MailSender | undefined;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new MailSenderError(`${name} is required for tencent_api`, false, "ConfigurationError");
  return value;
}

function region() {
  const value = required("TENCENT_SES_REGION");
  if (value !== "ap-guangzhou" && value !== "ap-hongkong") {
    throw new MailSenderError("TENCENT_SES_REGION must be ap-guangzhou or ap-hongkong", false, "ConfigurationError");
  }
  return value;
}

function fromAddress() {
  const address = required("MAIL_FROM_ADDRESS");
  if (!/^[^@\s<>]+@mail\.xiudou\.site$/i.test(address)) {
    throw new MailSenderError("MAIL_FROM_ADDRESS must use the verified mail.xiudou.site domain", false, "ConfigurationError");
  }
  const name = required("MAIL_FROM_NAME");
  if (name.length > 120 || /[:<>\r\n]/.test(name)) {
    throw new MailSenderError("MAIL_FROM_NAME contains unsupported characters", false, "ConfigurationError");
  }
  return `${name} <${address}>`;
}

function templateData(vars: Record<string, string>) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, escapeHtml(value)]),
  ));
}

function templateId(template: OutgoingMail["template"]) {
  const names = {
    verify_email: "SES_TEMPLATE_VERIFY_EMAIL",
    subscribe_confirm: "SES_TEMPLATE_SUBSCRIBE_CONFIRM",
    post_published: "SES_TEMPLATE_POST_PUBLISHED",
    password_reset: "SES_TEMPLATE_PASSWORD_RESET",
    security_alert: "SES_TEMPLATE_SECURITY_ALERT",
  } as const;
  const name = names[template];
  const raw = process.env[name]?.trim();
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value <= 0) {
    throw new MailSenderError(`模板 ${template} 未配置 TemplateID`, false, "ConfigurationError");
  }
  return value;
}

function client() {
  if (singletonClient) return singletonClient;
  const Client = ses.v20201002.Client;
  singletonClient = new Client({
    credential: {
      secretId: required("TENCENT_SECRET_ID"),
      secretKey: required("TENCENT_SECRET_KEY"),
    },
    region: region(),
    profile: {
      signMethod: "TC3-HMAC-SHA256",
      httpProfile: { reqMethod: "POST", reqTimeout: 30 },
    },
  });
  return singletonClient;
}

export function createTencentSender(sesClient: SesClient): MailSender {
  return {
    async send(mail) {
      const request: SendEmailRequest = {
        FromEmailAddress: fromAddress(),
        Destination: [mail.to],
        Subject: mail.subject,
        Template: {
          TemplateID: templateId(mail.template),
          TemplateData: templateData(mail.vars),
        },
        TriggerType: mail.template === "post_published" ? 0 : 1,
        Unsubscribe: "0",
        ...(process.env.MAIL_REPLY_TO?.trim() ? { ReplyToAddresses: process.env.MAIL_REPLY_TO.trim() } : {}),
        ...(mail.headers ? { SmtpHeaders: JSON.stringify(mail.headers) } : {}),
      };
      try {
        await sesClient.SendEmail(request);
      } catch (error) {
        throw classifyTencentError(error);
      }
    },
  };
}

export function getTencentSender(): MailSender {
  singletonSender ??= createTencentSender(client());
  return singletonSender;
}

export function classifyTencentError(error: unknown) {
  const source = error as { message?: unknown; code?: unknown; requestId?: unknown; RequestId?: unknown };
  const message = String(source?.message ?? "Tencent SES delivery failed");
  const code = typeof source?.code === "string" ? source.code : undefined;
  const requestId = typeof source?.requestId === "string"
    ? source.requestId
    : typeof source?.RequestId === "string" ? source.RequestId : undefined;
  const permanent = Boolean(code && (
    PERMANENT_ERROR_CODES.has(code)
    || code.startsWith("AuthFailure.")
    || code.startsWith("InvalidParameterValue.")
    || code.startsWith("UnauthorizedOperation.")
  ));
  return new MailSenderError(message, !permanent, code, requestId, { cause: error });
}
