import { Fragment, type ReactNode } from "react";
import { splitAtColon, titleTokens } from "@/lib/text/title-breaks";

/**
 * 中文标题的断行。断行点怎么算见 lib/text/title-breaks.ts，这里只负责渲染：
 *
 * - 允许断行的位置插 `<wbr>`，配合 `.title-wrap` 的 `word-break: keep-all`
 *   关掉浏览器默认的逐字断行。
 * - 「主题：副题」结构里，副题包成 inline-block：一行放不下时整段副题换到下一
 *   行，而不是在副题中间随便折。主题保持普通行内流，自己太长时照常按词换行。
 */

function withBreaks(text: string, keyPrefix: string): ReactNode[] {
  return titleTokens(text).flatMap((token, index) => {
    const content = token.keepTogether
      ? <span key={`${keyPrefix}t${index}`} className="whitespace-nowrap">{token.text}</span>
      : <Fragment key={`${keyPrefix}t${index}`}>{token.text}</Fragment>;
    return token.breakBefore ? [<wbr key={`${keyPrefix}w${index}`} />, content] : [content];
  });
}

export function WrappedTitle({ text }: { text: string }) {
  const parts = splitAtColon(text);
  if (!parts) return <span className="title-wrap">{withBreaks(text, "")}</span>;

  return (
    <span className="title-wrap">
      {withBreaks(parts[0], "h")}
      <wbr />
      <span className="inline-block">{withBreaks(parts[1], "s")}</span>
    </span>
  );
}
