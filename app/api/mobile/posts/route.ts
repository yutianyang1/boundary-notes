import { NextResponse } from "next/server";
import { mobilePosts } from "@/lib/mobile/posts";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawPage = url.searchParams.get("page") ?? "1";
  if (!/^\d{1,4}$/.test(rawPage) || Number(rawPage) < 1) return NextResponse.json({ error: "页码无效" }, { status: 400 });
  const rows = await mobilePosts((url.searchParams.get("q") ?? "").trim().slice(0, 120), Number(rawPage));
  return NextResponse.json({ posts: rows.slice(0, 20), hasMore: rows.length > 20 }, { headers: { "Cache-Control": "public, max-age=30" } });
}
