import Link from "next/link";
import { createTranslator } from "next-intl";
import { localePath } from "@/i18n/href";
import { displayName } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import type { getPublishedTagCloud } from "@/lib/posts/queries";

type TagCloudEntry = Awaited<ReturnType<typeof getPublishedTagCloud>>[number];

/** 侧栏放得下的量。再多就会把右列拖得比正文还长，本末倒置。 */
const RAIL_LIMIT = 12;

/**
 * 首页右栏的标签云。
 *
 * 热门文章只有 5 条，右列到这里就断了，而左边的卡片网格还在继续，页面右下角
 * 因此空出一大块。这里接一块真正有用的导航，而不是把空白留着。
 */
export function TagRail({
  locale,
  tags,
}: {
  locale: Locale;
  tags: TagCloudEntry[];
}) {
  if (!tags.length) return null;
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "nav" });

  return (
    <div>
      <h2 className="headline-sm text-xl">{t("tags")}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {tags.slice(0, RAIL_LIMIT).map((tag) => (
          <li key={tag.slug}>
            <Link
              href={localePath(`/tags/${tag.slug}`, locale)}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold transition-[border-color,color] hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* 标签名是内容，语言随正文而非界面。 */}
              <span lang="zh-CN">{displayName(tag, locale)}</span>
              <span className="tabular-nums text-muted-foreground">{tag.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
