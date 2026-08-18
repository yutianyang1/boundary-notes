import Link from "next/link";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { auth } from "@/auth";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { readPostsAmong } from "@/lib/posts/read-progress";
import { resetSeriesProgressAction } from "@/lib/posts/reading-actions";

type ViewProps = {
  locale: Locale;
  seriesSlug: string;
  read: number;
  total: number;
  className?: string;
};

/**
 * 进度条本身。已读数由调用方查好传进来——系列页为了给卡片打角标,
 * 本来就得取一次已读集合,没必要为了这条进度再查一遍、再验一次 session。
 */
export function SeriesProgressView({ locale, seriesSlug, read, total, className = "" }: ViewProps) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "series" });
  // 一篇都没读时整块不渲染:新读者不需要看到一个 0 / 7。
  if (!total || !read) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span className="tabular-nums">{t("progress", { read, total })}</span>
        {/* 原生 form:重置不依赖 JS 也能用。 */}
        <form action={resetSeriesProgressAction.bind(null, seriesSlug)}>
          <button
            type="submit"
            className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("resetProgress")}
          </button>
        </form>
      </div>
      <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(read / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** 未登录时的一句话说明。进度按账号存,没账号就没有可显示的东西。 */
export function SeriesSignInPrompt({
  locale,
  seriesSlug,
  className = "",
}: {
  locale: Locale;
  seriesSlug: string;
  className?: string;
}) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "series" });
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      <Link
        href={localePath(`/login?callbackUrl=${encodeURIComponent(`/series/${seriesSlug}`)}`, locale)}
        className="font-semibold text-primary hover:underline"
      >
        {t("signInPrompt")}
      </Link>
      {t("signInSuffix")}
    </p>
  );
}

/**
 * 自己取数的版本,给文章页的系列导航卡用。
 * 读 session,是页面上的一个动态洞——调用方要包 Suspense。
 */
export async function SeriesReadProgress({
  locale,
  seriesSlug,
  postIds,
  className = "",
}: {
  locale: Locale;
  seriesSlug: string;
  postIds: string[];
  className?: string;
}) {
  await connection();
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const read = await readPostsAmong(userId, postIds);
  return (
    <SeriesProgressView
      locale={locale}
      seriesSlug={seriesSlug}
      read={read.size}
      total={postIds.length}
      className={className}
    />
  );
}
