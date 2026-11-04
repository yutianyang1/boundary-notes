import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { verifyMfaChallengeAction } from "@/app/[locale]/(auth)/mfa/actions";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/social/http";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await auth();
  if (!session?.user?.id || !session.sessionId || session.authState !== "mfa_pending") {
    return NextResponse.json({ error: "请先使用邮箱和密码登录" }, { status: 401 });
  }
  const body = await parseJsonBody(request, z.object({ code: z.string().trim().min(1).max(64) }).strict());
  if (!body) return NextResponse.json({ error: "请输入验证码" }, { status: 400 });
  const form = new FormData();
  form.set("code", body.code);
  // Reuse the website's limiter, recovery-code consumption, audit trail and session upgrade.
  const result = await verifyMfaChallengeAction({}, form);
  if (!result.success) {
    const limited = result.errorKey === "errors.tooManyAttempts";
    return NextResponse.json({ error: limited ? "尝试次数过多，请稍后重试" : "验证码或恢复码不正确" }, { status: limited ? 429 : 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
