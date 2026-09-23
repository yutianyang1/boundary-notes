import { NextResponse } from "next/server";
import { getSocialSession, unauthorized } from "@/lib/social/http";
import { searchSocialUsers } from "@/lib/social/service";

export async function GET(request: Request) {
  const session = await getSocialSession();
  if (!session) return unauthorized();
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const users = await searchSocialUsers(session.user.id, query);
  return NextResponse.json({ users }, { headers: { "Cache-Control": "private, no-store" } });
}
