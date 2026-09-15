import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { isWebSshEnabled } from "@/lib/features";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import {
  closeTerminalSession,
  resizeTerminalSession,
  WebSshError,
  writeTerminalSession,
} from "@/lib/terminal/sessions";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("input"), data: z.string().max(16_384) }).strict(),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().min(20).max(500),
    rows: z.number().int().min(5).max(300),
  }).strict(),
]);

async function admin() {
  if (!isWebSshEnabled()) return null;
  const session = await auth();
  return session?.user && session.authState === "full" && session.user.role === "admin" ? session : null;
}

function failure(error: unknown) {
  if (error instanceof WebSshError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "终端操作失败。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  const session = await admin();
  if (!session) return NextResponse.json({ error: "没有访问权限。" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "终端操作参数不合法。" }, { status: 400 });
  const { id } = await params;
  try {
    if (parsed.data.type === "input") writeTerminalSession(id, session.user.id, parsed.data.data);
    else resizeTerminalSession(id, session.user.id, parsed.data.cols, parsed.data.rows);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  const session = await admin();
  if (!session) return NextResponse.json({ error: "没有访问权限。" }, { status: 403 });
  const { id } = await params;
  try {
    closeTerminalSession(id, session.user.id);
    await db.insert(auditLogs).values({
      actorId: session.user.id,
      action: "terminal.disconnect",
      targetType: "ssh_session",
      targetId: id,
    }).catch(() => undefined);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
