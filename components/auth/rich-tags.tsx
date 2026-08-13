import type { ReactNode } from "react";

/**
 * 认证页面板标题里的富文本标签。
 *
 * 字典里写成 `回到你的<hl>工作台</hl>，继续未完的推敲。`，
 * 交给 t.rich 渲染，这样译文可以自行决定强调落在哪个词上——
 * 英文的重音位置和中文往往不在同一处。
 */
export const authRichTags = {
  hl: (chunks: ReactNode) => (
    <span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">
      {chunks}
    </span>
  ),
  accent: (chunks: ReactNode) => <span className="text-primary">{chunks}</span>,
};
