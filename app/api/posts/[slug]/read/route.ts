import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { buildPublicPostIdQuery } from "@/lib/posts/queries";
import { markPostRead } from "@/lib/posts/read-progress";

/**
 * 标记「这篇读完了」。走 API 路由而不是 server action:
 * server action 每次都会带回一份当前页面的 RSC,而这里只需要写一行,
 * 没必要为此重渲染整篇文章。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  // 匿名访客不记录。前端本来就不会为未登录的人渲染这个组件,
  // 这里是第二道:接口本身不接受没有身份的写入。
  if (!userId || session?.authState !== "full") {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const { slug } = await params;
  if (!slug || slug.length > 240) {
    return NextResponse.json({ error: "文章不存在。" }, { status: 404 });
  }

  const [post] = await buildPublicPostIdQuery(slug);
  if (!post) return NextResponse.json({ error: "文章不存在。" }, { status: 404 });

  await markPostRead(userId, post.id);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
