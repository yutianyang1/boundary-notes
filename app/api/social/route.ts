import { NextResponse } from "next/server";
import { getSocialSession, unauthorized } from "@/lib/social/http";
import { getSocialSummary } from "@/lib/social/service";

export async function GET() {
  const session = await getSocialSession();
  if (!session) return unauthorized();
  const summary = await getSocialSummary(session.user.id);
  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}
