import { NextResponse } from "next/server";
import { z } from "zod";
import { getSocialSession, parseJsonBody, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { changeFriendship, consumeSocialRateLimit, requestOrAcceptFriend } from "@/lib/social/service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), targetId: z.string().uuid() }).strict(),
  z.object({ action: z.enum(["accept", "reject", "remove"]), friendshipId: z.string().uuid() }).strict(),
]);

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  if (!consumeSocialRateLimit(`friend:${session.user.id}`, 12, 60_000)) {
    return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: 429 });
  }
  const body = await parseJsonBody(request, schema);
  if (!body) return NextResponse.json({ error: "提交内容无效。" }, { status: 400 });
  try {
    const result = body.action === "request"
      ? await requestOrAcceptFriend(session.user.id, body.targetId)
      : await changeFriendship(session.user.id, body.friendshipId, body.action);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialError(error);
  }
}
