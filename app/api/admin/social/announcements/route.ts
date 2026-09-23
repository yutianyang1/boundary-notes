import { NextResponse } from "next/server";
import { z } from "zod";
import { getSocialSession, parseJsonBody, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { consumeSocialRateLimit, sendSocialAnnouncement } from "@/lib/social/service";

const schema = z.object({ content: z.string().min(1).max(4000) }).strict();

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return NextResponse.json({ error: "只有管理员可以群发消息。" }, { status: 403 });
  if (!consumeSocialRateLimit(`broadcast:${session.user.id}`, 3, 60_000)) {
    return NextResponse.json({ error: "群发太频繁，请稍后再试。" }, { status: 429 });
  }
  const body = await parseJsonBody(request, schema);
  if (!body) return NextResponse.json({ error: "群发内容不能为空，且最多 4000 个字符。" }, { status: 400 });
  try {
    const announcement = await sendSocialAnnouncement(session.user.id, body.content);
    return NextResponse.json(announcement, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialError(error);
  }
}
