import { NextResponse } from "next/server";
import { getSocialSession, parseJsonBody, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { groupActionSchema } from "@/lib/social/groups-input";
import { changeFriendGroup } from "@/lib/social/groups";
import { consumeSocialRateLimit } from "@/lib/social/service";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if(rejected) return rejected;
  const session = await getSocialSession(); if(!session) return unauthorized();
  if(!consumeSocialRateLimit(`groups:${session.user.id}`,60,60_000)) return NextResponse.json({error:"操作太频繁，请稍后再试。"},{status:429});
  const action = await parseJsonBody(request,groupActionSchema);
  if(!action) return NextResponse.json({error:"提交内容无效。"},{status:400});
  try { return NextResponse.json(await changeFriendGroup(session.user.id,action),{headers:{"Cache-Control":"no-store"}}); }
  catch(error) { return socialError(error); }
}
