"use client";

import { memo } from "react";

/**
 * Keep the server-rendered article HTML behind a memoized client boundary.
 * Theme changes and streamed sibling Suspense boundaries must not make React
 * re-apply innerHTML and discard the progressive enhancements inside it.
 *
 * `lang` 标的是正文自身的语言，而不是界面语言。文章一律是中文，而 /en 下
 * <html lang="en">——不在这里声明的话，浏览器会把整页当英文，
 * 于是不再向英文读者提示「翻译此页」，正好把我们指望的能力关掉。
 */
export const ArticleBody = memo(function ArticleBody({
  html,
  className,
  lang = "zh-CN",
}: {
  html: string;
  className: string;
  lang?: string;
}) {
  return (
    <div
      data-article-body
      lang={lang}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
