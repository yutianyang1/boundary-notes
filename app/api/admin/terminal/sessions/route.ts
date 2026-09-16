import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { isWebSshEnabled } from "@/lib/features";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { createTerminalSession, listTerminalSessions, WebSshError } from "@/lib/terminal/sessions";

const requestSchema = z.object({
  host: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.:_-]+$/),
  port: z.number().int().min(1).max(65_535),
  username: z.string().min(1).max(128),
  password: z.string().max(4_096).optional(),
  privateKey: z.string().max(65_536).optional(),
  passphrase: z.string().max(4_096).optional(),
  hostKeyFingerprint: z.string().max(160).optional(),
  cols: z.number().int().min(20).max(500),
  rows: z.number().int().min(5).max(300),
}).strict().refine((value) => Boolean(value.password) !== Boolean(value.privateKey), {
  message: "请选择密码或私钥中的一种登录方式。",
});

function errorResponse(error: unknown) {
  if (error instanceof WebSshError) {
    return NextResponse.json({
      error: error.message,
      code: error.code,
      fingerprint: error.fingerprint,
    }, { status: error.status });
  }
  return NextResponse.json({ error: "无法创建 SSH 连接。", code: "INTERNAL_ERROR" }, { status: 500 });
}

export async function GET() {
  if (!isWebSshEnabled()) return NextResponse.json({ error: "Web SSH 未启用。" }, { status: 404 });
  const session = await auth();
  if (!session?.user || session.authState !== "full" || session.user.role !== "admin") {
    return NextResponse.json({ error: "只有管理员可以使用 Web SSH。" }, { status: 403 });
  }
  return NextResponse.json(
    { sessions: listTerminalSessions(session.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isWebSshEnabled()) return NextResponse.json({ error: "Web SSH 未启用。" }, { status: 404 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  const session = await auth();
  if (!session?.user || session.authState !== "full" || session.user.role !== "admin") {
    return NextResponse.json({ error: "只有管理员可以使用 Web SSH。" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 80_000) return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "连接参数不合法。" }, { status: 400 });
  }

  try {
    const created = await createTerminalSession(session.user.id, parsed.data);
    await db.insert(auditLogs).values({
      actorId: session.user.id,
      action: "terminal.connect",
      targetType: "ssh_host",
      targetId: `${created.username}@${created.host}:${created.port}`.slice(0, 160),
      after: { fingerprint: created.fingerprint },
    }).catch(() => undefined);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
