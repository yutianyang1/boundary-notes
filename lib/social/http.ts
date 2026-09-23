import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isSameOriginRequest } from "@/lib/http/same-origin";

export async function getSocialSession() {
  const session = await auth();
  if (!session?.user?.id || !session.sessionId || session.authState !== "full") return null;
  return session;
}

export function rejectCrossOrigin(request: Request) {
  return isSameOriginRequest(request)
    ? null
    : NextResponse.json({ error: "请求来源不合法。" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export async function parseJsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | null> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_000) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 16_000) return null;
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "请先登录并完成验证。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export function socialError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败。" }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export const uuidSchema = z.string().uuid();
