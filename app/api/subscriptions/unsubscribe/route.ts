import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/subscribe/service";

export async function POST(request: Request) {
  const url = new URL(request.url);
  await unsubscribe(url.searchParams.get("id") ?? "", url.searchParams.get("token") ?? "");
  return new NextResponse(null, { status: 200 });
}
