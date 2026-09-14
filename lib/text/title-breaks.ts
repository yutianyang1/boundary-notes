/**
 * 标题断行点的计算，供 components/wrapped-title.tsx 渲染。
 *
 * 浏览器给中文断行只认字不认词，线上出现过「把注意 / 力」「我 / 的」「听得 /
 * 见」。这里把标题切成 token，并标出哪些 token 之前允许换行；组件据此插
 * `<wbr>`，再用 `word-break: keep-all` 关掉逐字断行。
 *
 * 规则：
 * - 词与词之间可以断（`Intl.Segmenter` 切词；没带中文词典的运行环境会退化成
 *   逐字，等于原来的行为，不会更糟）。
 * - 开引号/开括号**之前**可以断，闭标点**之后**可以断；反过来不行——`<wbr>`
 *   的断行机会会压过避头尾规则，放错位置就会有一行以「”」开头。
 * - 连续的拉丁字符（Barge-in、Q/K/V）合成一个 token 且不在内部断，否则会
 *   出现「Barge- / in」。太长的（超过 16 字符）不强制，免得在窄屏上撑破容器。
 */

export type TitleToken = {
  text: string;
  /** 这个 token 之前是否放一个断行机会。 */
  breakBefore: boolean;
  /** 拉丁词整体不断行。 */
  keepTogether: boolean;
};

const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
const HAN = /\p{Script=Han}/u;
const SPACE = /^\s+$/u;
const OPENERS = /^[“‘「『（《【(\[]/u;
const CLOSERS = /[”’」』）》】)\]，。、；：！？]$/u;
const CJK_PUNCT = /^[　-〿＀-￯“”‘’]+$/u;
const MAX_UNBREAKABLE_LATIN = 16;
const MAX_SINGLE_RUN = 4;

type Kind = "han" | "latin" | "space" | "punct";

function kindOf(segment: string): Kind {
  if (HAN.test(segment)) return "han";
  if (SPACE.test(segment)) return "space";
  if (CJK_PUNCT.test(segment)) return "punct";
  return "latin";
}

export function titleTokens(text: string): TitleToken[] {
  // 先按词切，再把相邻的拉丁片段并起来（Segmenter 会把 Barge-in 切成三段）。
  const raw: { text: string; kind: Kind; single?: boolean }[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const kind = kindOf(segment);
    const last = raw.at(-1);
    if (kind === "latin" && last?.kind === "latin") {
      last.text += segment;
    } else if (
      // 词典没收的词会被切成一串单字（线上「实时」就被切成「实|时」，结果在
      // 两字之间换了行）。连续单字并成一段，最多 4 字，再长就另起一段，免得
      // 一长串都不许断、在窄屏上撑破。
      kind === "han" && segment.length === 1 &&
      last?.kind === "han" && last.single && last.text.length < MAX_SINGLE_RUN
    ) {
      last.text += segment;
    } else {
      raw.push({ text: segment, kind, single: kind === "han" && segment.length === 1 });
    }
  }

  return raw.map((token, index) => {
    const previous = raw[index - 1];
    let breakBefore = false;
    if (previous && token.kind !== "space" && previous.kind !== "space") {
      if (token.kind === "punct") {
        breakBefore = OPENERS.test(token.text);
      } else if (previous.kind === "punct") {
        breakBefore = CLOSERS.test(previous.text);
      } else {
        // 汉字与汉字、汉字与拉丁词之间
        breakBefore = token.kind === "han" || previous.kind === "han";
      }
    }
    return {
      text: token.text,
      breakBefore,
      keepTogether: token.kind === "latin" && token.text.length <= MAX_UNBREAKABLE_LATIN,
    };
  });
}

/**
 * 「主题：副题」结构的分界。返回 null 表示不是这种结构（没有全角冒号，或冒号
 * 在最前/最后）。
 */
export function splitAtColon(text: string): [string, string] | null {
  const colon = text.indexOf("：");
  if (colon <= 0 || colon >= text.length - 1) return null;
  return [text.slice(0, colon + 1), text.slice(colon + 1).trimStart()];
}
