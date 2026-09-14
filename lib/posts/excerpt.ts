/**
 * 从 Markdown 正文里裁一段能当摘要用的纯文本。
 *
 * 作者没填 summary 的文章，卡片上就只剩标题和日期。卡片是等高的、元信息又靠
 * `mt-auto` 贴在底边，于是标题和日期之间会撑开一大块空白——归档页一排卡片里
 * 有摘要的和没摘要的摆在一起，没摘要的那张看起来像渲染失败。RSS 同理，条目的
 * <description> 会是空的。
 *
 * 这里不追求完整的 Markdown 解析：目标只是拿到开头两行像人话的字，所以按「先
 * 丢掉整块的非正文结构，再逐行剥掉行内标记」处理，遇到不认识的语法宁可多留几
 * 个字符，也不引一个解析器进来。
 */

/** 卡片上限两行，中文两行约 60~70 字，留一点余量。 */
const DEFAULT_MAX_LENGTH = 90;

const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const FRONT_MATTER_EDGE = /^(?:---|\+\+\+)[ \t]*$/;

/**
 * 整块丢弃的结构：front matter、围栏代码、表格、脚注定义。
 *
 * 围栏按行扫状态，不用正则一把梭：`/^```[\s\S]*?(?:\1|$)/gm` 看着能用，但 `m`
 * 标志下的 `$` 在行尾就匹配上了，惰性量词于是在开围栏那一行末尾停住，代码本身
 * 一行没删。正文被 `left()` 截断时还可能只剩半个围栏，扫描式天然能兜住。
 */
function stripBlocks(markdown: string) {
  const withoutInlineBlocks = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    // 图片先于链接处理，否则 ![alt](src) 会被当成链接留下 alt
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "");

  const lines = withoutInlineBlocks.split(/\r?\n/);
  const kept: string[] = [];
  let fence: string | null = null;
  let inFrontMatter = false;

  for (const [index, line] of lines.entries()) {
    if (fence) {
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (inFrontMatter) {
      if (FRONT_MATTER_EDGE.test(line)) inFrontMatter = false;
      continue;
    }
    if (index === 0 && FRONT_MATTER_EDGE.test(line)) {
      inFrontMatter = true;
      continue;
    }
    const opening = FENCE.exec(line);
    if (opening) {
      fence = opening[1];
      continue;
    }
    // 标题整行丢掉，不是剥掉 # 就算数：文章的 H1 基本就是标题本身，卡片上方
    // 已经印了一遍，跟进摘要就是重复。小标题同理，不是能独立读的句子。
    if (/^[ \t]*#{1,6}[ \t]/.test(line)) continue;
    // 表格行与脚注定义都不是能读的句子
    if (/^[ \t]*\|/.test(line)) continue;
    if (/^[ \t]*\[\^[^\]]+\]:/.test(line)) continue;
    kept.push(line);
  }

  return kept.join("\n");
}

/** 逐行剥掉行首标记：引用、列表。标题在 stripBlocks 里已整行丢弃。 */
function stripLinePrefixes(line: string) {
  return line
    .replace(/^[ \t]*>[ \t]?/, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, "");
}

/** 剥掉行内标记，保留可读的文字。 */
function stripInline(text: string) {
  return text
    // 链接留锚文本，丢地址
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]/g, "")
    // 行内代码与数学：反引号/美元符号本身不该出现在摘要里
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/<[^>]+>/g, "")
    // 强调符号。** 要先于 * 处理，否则会留下落单的星号。
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/(?<![\w一-鿿])_([^_]*)_(?![\w一-鿿])/g, "$1")
    .replace(/~~([^~]*)~~/g, "$1");
}

/** 只由标记符号构成的行（分隔线、残留的围栏）不算正文。 */
function isProse(line: string) {
  return line.length > 0 && !/^[-*_=~`|#>\s]+$/.test(line);
}

export function excerptFromMarkdown(markdown: string, maxLength = DEFAULT_MAX_LENGTH) {
  if (!markdown) return "";

  const lines = stripBlocks(markdown)
    .split(/\r?\n/)
    .map((line) => stripInline(stripLinePrefixes(line)).trim())
    .filter(isProse);

  if (lines.length === 0) return "";

  // 连着取几行，够长就停。单独一行常常是个小标题，凑不满一张卡片的两行。
  let text = "";
  for (const line of lines) {
    text = text ? `${text} ${line}` : line;
    if (text.length >= maxLength) break;
  }

  text = text.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  // 截断点尽量落在句读上，避免把一个词或一句话劈成两半。
  const window = text.slice(0, maxLength);
  const breakAt = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
    window.lastIndexOf("；"),
  );
  if (breakAt >= maxLength * 0.5) return window.slice(0, breakAt + 1);
  return `${window.trimEnd()}…`;
}
