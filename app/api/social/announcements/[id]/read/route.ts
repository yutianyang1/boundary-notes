import { NextResponse } from "next/server";
import { getSocialSession, rejectCrossOrigin, unauthorized } from "@/lib/social/http";
import { markAnnouncementRead } from "@/lib/social/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  const { id } = await params;
  await markAnnouncementRead(session.user.id, id);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
