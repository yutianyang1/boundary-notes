import { NextResponse } from "next/server";
import { createTranslator } from "next-intl";
import { registerAction, completeRegistrationResult, type RegisterMessageKey } from "@/app/[locale]/(auth)/register/actions";
import { messagesFor } from "@/i18n/messages";
import { extractClientIp } from "@/lib/auth/device";
import { verifyEmailToken } from "@/lib/auth/email-verification";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { mobileRegistrationSchema } from "@/lib/mobile/registration-input";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/social/http";
import { consumeSocialRateLimit } from "@/lib/social/service";

const headers = { "Cache-Control": "no-store" };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
function failure(key: RegisterMessageKey, seconds = 0) {
  const t = createTranslator({ locale: "zh", messages: messagesFor("zh"), namespace: "auth" });
  const status = key === "errors.registrationClosed" ? 403 : key === "errors.emailTaken" || key === "errors.registrationAlreadyDone" ? 409
    : key === "errors.serviceUnavailable" ? 503 : key === "errors.resendCooldown" || key === "errors.sendQuotaExceeded" ? 429 : 400;
  return NextResponse.json({ error: t(key, { seconds }), code: key, cooldownSeconds: seconds }, { status, headers: { ...headers, ...(seconds > 0 ? { "Retry-After": String(seconds) } : {}) } });
}
export async function GET() {
  return reply({ enabled: isPublicRegistrationEnabled() });
}
export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isPublicRegistrationEnabled()) return failure("errors.registrationClosed");
  const body = await parseJsonBody(request, mobileRegistrationSchema);
  if (!body) return reply({ error: "注册信息无效，请检查后重试" }, 400);
  if (!consumeSocialRateLimit(`mobile-registration:${extractClientIp(request.headers) ?? "unknown"}`, 30, 60_000)) return reply({ error: "操作太频繁，请稍后重试" }, 429);
  const form = new FormData();
  form.set("locale", "zh");
  if (body.action === "request") {
    form.set("email", body.email);
    if (body.resend) form.set("intent", "resend");
    const result = await registerAction({}, form);
    if (result.status !== "sent") return failure(result.messageKey ?? "errors.serviceUnavailable", result.cooldownSeconds);
    const t = createTranslator({ locale: "zh", messages: messagesFor("zh"), namespace: "auth" });
    return reply({ stage: "email_sent", email: result.email, emailHint: result.emailHint, cooldownSeconds: result.cooldownSeconds ?? 60,
      notice: result.noticeKey ? t(result.noticeKey, { seconds: result.cooldownSeconds ?? 60 }) : null });
  }
  form.set("token", body.token);
  if (body.action === "verify") {
    const result = await verifyEmailToken(body.token);
    if (result.status === "pending") return reply({ stage: "verified", email: result.email });
    if (result.status === "legacy") return reply({ stage: "already_registered" });
    return failure(result.status === "closed" ? "errors.registrationClosed" : "errors.registrationLinkInvalid");
  }
  form.set("name", body.name);
  form.set("password", body.password);
  form.set("confirmPassword", body.confirmPassword);
  const result = await completeRegistrationResult(form);
  return result.success ? reply({ stage: "registered" }) : failure(result.errorKey ?? "errors.serviceUnavailable");
}
