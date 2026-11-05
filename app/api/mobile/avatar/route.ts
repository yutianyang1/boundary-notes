import { NextResponse } from "next/server";
import { POST as upload } from "@/app/api/account/avatar/route";
import { getSocialSession,rejectCrossOrigin,unauthorized } from "@/lib/social/http";
import { consumeSocialRateLimit } from "@/lib/social/service";
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  const session=await getSocialSession();if(!session)return unauthorized();
  if(!consumeSocialRateLimit(`mobile-avatar:${session.user.id}`,6,60_000))return NextResponse.json({error:"操作太频繁，请稍后再试。"},{status:429});
  const length=Number(request.headers.get("content-length")??0);
  if(length>2*1024*1024+64*1024)return NextResponse.json({error:"头像不能超过 2 MB。"},{status:413});
  return upload(request);
}
