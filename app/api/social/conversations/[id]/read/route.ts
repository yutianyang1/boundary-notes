import { NextResponse } from "next/server";
import { getSocialSession, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { markConversationRead } from "@/lib/social/service";
import { z } from "zod";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  try {
    const { id } = await params;
    const text = await request.text();
    if(text.length > 1024) return NextResponse.json({error:"提交内容无效。"},{status:400});
    const body = z.object({messageId:z.string().uuid().optional()}).strict().safeParse(text ? JSON.parse(text) : {});
    if(!body.success) return NextResponse.json({error:"提交内容无效。"},{status:400});
    await markConversationRead(session.user.id, id, body.data.messageId);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialError(error);
  }
}
