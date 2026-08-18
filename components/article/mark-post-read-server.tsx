import { connection } from "next/server";
import { auth } from "@/auth";
import { MarkPostRead } from "@/components/article/mark-post-read";

/**
 * 未登录就什么都不渲染:匿名访客不记录阅读进度,
 * 也就不该为他们下发这段脚本、更不该让他们发出注定被拒的请求。
 *
 * 调用方要包 Suspense——这里读 session,是文章外壳上的一个动态洞。
 */
export async function MarkPostReadServer({ slug }: { slug: string }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) return null;
  return <MarkPostRead slug={slug} />;
}
