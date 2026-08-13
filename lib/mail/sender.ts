import type { MailTemplate } from "@/lib/mail/message";
import { getSmtpSender } from "@/lib/mail/senders/smtp";
import { getTencentSender } from "@/lib/mail/senders/tencent";

export type OutgoingMail = {
  to: string;
  template: MailTemplate;
  subject: string;
  vars: Record<string, string>;
  headers?: Record<string, string>;
};

export interface MailSender {
  send(mail: OutgoingMail): Promise<void>;
}

export class MailSenderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code?: string,
    readonly requestId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MailSenderError";
  }
}

export function getMailSender(): MailSender {
  const provider = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  if (provider === "smtp") return getSmtpSender();
  if (provider === "tencent_api") return getTencentSender();
  throw new Error(`Unknown MAIL_PROVIDER: ${provider || "(missing)"}`);
}
