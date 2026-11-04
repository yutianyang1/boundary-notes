import { NextResponse } from "next/server";
import { mobilePost } from "@/lib/mobile/posts";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await mobilePost(slug);
  return post ? NextResponse.json({ post }, { headers: { "Cache-Control": "public, max-age=30" } }) : NextResponse.json({ error: "文章不存在" }, { status: 404 });
}
