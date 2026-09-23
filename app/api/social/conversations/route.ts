import { NextResponse } from "next/server";
import { z } from "zod";
import { getSocialSession, parseJsonBody, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { consumeSocialRateLimit, getOrCreateConversation } from "@/lib/social/service";

const schema = z.object({ friendId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  if (!consumeSocialRateLimit(`conversation:${session.user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: 429 });
  }
  const body = await parseJsonBody(request, schema);
  if (!body) return NextResponse.json({ error: "提交内容无效。" }, { status: 400 });
  try {
    const conversation = await getOrCreateConversation(session.user.id, body.friendId);
    return NextResponse.json(conversation, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialError(error);
  }
}
