import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { updateProfileAction } from "@/app/[locale]/(site)/account/actions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSocialSession, parseJsonBody, rejectCrossOrigin, unauthorized } from "@/lib/social/http";
import { consumeSocialRateLimit } from "@/lib/social/service";

const input=z.object({name:z.string().trim().min(1).max(120)}).strict();
async function profile(userId:string){
  const [user]=await db.select({id:users.id,name:users.name,email:users.email,image:users.image,role:users.role}).from(users).where(eq(users.id,userId)).limit(1);
  return NextResponse.json({user},{headers:{"Cache-Control":"no-store"}});
}
export async function GET(){const session=await getSocialSession();return session?profile(session.user.id):unauthorized();}
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  const session=await getSocialSession();if(!session)return unauthorized();
  if(!consumeSocialRateLimit(`mobile-profile:${session.user.id}`,20,60_000))return NextResponse.json({error:"操作太频繁，请稍后再试。"},{status:429});
  const body=await parseJsonBody(request,input);if(!body)return NextResponse.json({error:"昵称应为 1 至 120 个字符。"},{status:400});
  const form=new FormData();form.set("name",body.name);
  const result=await updateProfileAction({},form);
  if(result.errorKey)return NextResponse.json({error:"资料更新失败，请重新登录后重试。"},{status:400});
  return profile(session.user.id);
}
