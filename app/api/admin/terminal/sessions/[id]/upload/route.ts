import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { isWebSshEnabled } from "@/lib/features";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { uploadTerminalFile, WebSshError } from "@/lib/terminal/sessions";

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

function failure(error: unknown) {
  if (error instanceof WebSshError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "文件上传失败。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isWebSshEnabled()) return NextResponse.json({ error: "Web SSH 未启用。" }, { status: 404 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  const session = await auth();
  if (!session?.user || session.authState !== "full" || session.user.role !== "admin") {
    return NextResponse.json({ error: "没有访问权限。" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "单个文件不能超过 24 MiB。" }, { status: 413 });
  }
  const filename = new URL(request.url).searchParams.get("name") ?? "";
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "单个文件不能超过 24 MiB。" }, { status: 413 });
  }

  const { id } = await params;
  try {
    const uploaded = await uploadTerminalFile(id, session.user.id, filename, data);
    await db.insert(auditLogs).values({
      actorId: session.user.id,
      action: "terminal.upload",
      targetType: "ssh_session",
      targetId: id,
      after: { path: uploaded.path, byteSize: uploaded.bytes },
    }).catch(() => undefined);
    return NextResponse.json(uploaded, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
