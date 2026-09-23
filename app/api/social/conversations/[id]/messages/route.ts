import { NextResponse } from "next/server";
import { z } from "zod";
import { getSocialSession, parseJsonBody, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { consumeSocialRateLimit, listConversationMessages, sendDirectMessage } from "@/lib/social/service";

const schema = z.object({ content: z.string().min(1).max(4000) }).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSocialSession();
  if (!session) return unauthorized();
  try {
    const { id } = await params;
    const messages = await listConversationMessages(session.user.id, id);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return socialError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  if (!consumeSocialRateLimit(`message:${session.user.id}`, 40, 60_000)) {
    return NextResponse.json({ error: "发送太频繁，请稍后再试。" }, { status: 429 });
  }
  const body = await parseJsonBody(request, schema);
  if (!body) return NextResponse.json({ error: "消息不能为空，且最多 4000 个字符。" }, { status: 400 });
  try {
    const { id } = await params;
    const message = await sendDirectMessage(session.user.id, id, body.content);
    return NextResponse.json({ message }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialError(error);
  }
}
