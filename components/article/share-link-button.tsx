"use client";

import { useState } from "react";

export function ShareLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary"
    >
      {copied ? "链接已复制" : "复制文章链接"}
    </button>
  );
}
