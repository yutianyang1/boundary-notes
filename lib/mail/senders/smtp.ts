import nodemailer from "nodemailer";
import { renderNormalizedMail } from "@/lib/mail/message";
import type { MailSender } from "@/lib/mail/sender";

let singleton: MailSender | undefined;

export function getSmtpSender(): MailSender {
  if (singleton) return singleton;
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) throw new Error("SMTP_HOST and SMTP_FROM are required");
  const client = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  singleton = {
    async send(mail) {
      await client.sendMail({
        from,
        to: mail.to,
        ...renderNormalizedMail(mail),
      });
    },
  };
  return singleton;
}
