import Link from "next/link";
import { createTranslator } from "next-intl";
import { localePath } from "@/i18n/href";
import { displayName } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import type { getPopularPosts } from "@/lib/posts/queries";

type PopularPost = Awaited<ReturnType<typeof getPopularPosts>>[number];

export function PopularPosts({
  locale,
  posts,
  headingLevel = "h3",
}: {
  locale: Locale;
  posts: PopularPost[];
  headingLevel?: "h2" | "h3";
}) {
  if (!posts.length) return null;
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "post" });
  const Heading = headingLevel;

  return (
    <div>
      <Heading className="eyebrow text-foreground/70">{t("popular")}</Heading>
      <ol className="mt-4 divide-y divide-hairline border-b border-hairline">
        {posts.map((post, index) => (
          <li key={post.id} className="py-4 first:pt-0">
            <Link href={localePath(`/posts/${post.slug}`, locale)} className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
              <span className={`pt-0.5 text-base font-extrabold tabular-nums ${index === 0 ? "text-warm" : "text-primary"}`}>
                {index + 1}
              </span>
              <span className="min-w-0">
                {/* 标题是文章内容，语言随正文而非界面，浏览器据此提示翻译。 */}
                <span lang="zh-CN" className="block text-sm font-semibold leading-6 group-hover:text-primary">
                  {post.title}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {post.categoryName ? <span>{displayName({ name: post.categoryName, nameEn: post.categoryNameEn }, locale)}</span> : null}
                  <span>{t("readCount", { count: post.viewCount })}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
