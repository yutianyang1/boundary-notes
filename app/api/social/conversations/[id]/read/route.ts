import { NextResponse } from "next/server";
import { getSocialSession, rejectCrossOrigin, socialError, unauthorized } from "@/lib/social/http";
import { markConversationRead } from "@/lib/social/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const session = await getSocialSession();
  if (!session) return unauthorized();
  try {
    const { id } = await params;
    await markConversationRead(session.user.id, id);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialError(error);
  }
}
