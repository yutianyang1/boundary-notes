"use client";

import { memo } from "react";

/**
 * Keep the server-rendered article HTML behind a memoized client boundary.
 * Theme changes and streamed sibling Suspense boundaries must not make React
 * re-apply innerHTML and discard the progressive enhancements inside it.
 */
export const ArticleBody = memo(function ArticleBody({ html, className }: { html: string; className: string }) {
  return <div data-article-body className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
