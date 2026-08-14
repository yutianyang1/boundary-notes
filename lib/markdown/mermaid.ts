import { createHash } from "node:crypto";
import { fromHtml } from "hast-util-from-html";

const MAX_MERMAID_DIAGRAMS = 12;
const MAX_MERMAID_SOURCE_LENGTH = 50_000;

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

type MermaidTarget = {
  parent: HastNode;
  index: number;
  code: HastNode;
  source: string;
  id: string;
};

let renderQueue: Promise<void> = Promise.resolve();
let mermaidPromise: ReturnType<typeof importMermaid> | undefined;

/**
 * Mermaid 11.15+ 用 constructable stylesheet 组装安全 CSS；svgdom 尚未实现该 Web API。
 * 服务端只需要 insertRule/cssRules，最终仍由 Mermaid 自己的 Stylis 管线编译命名空间。
 */
class ServerCssStyleSheet {
  cssRules: Array<{ cssText: string }> = [];

  insertRule(rule: string, index = this.cssRules.length) {
    this.cssRules.splice(index, 0, { cssText: rule });
    return index;
  }
}

if (typeof globalThis.CSSStyleSheet === "undefined") {
  Object.assign(globalThis, { CSSStyleSheet: ServerCssStyleSheet });
}

async function importMermaid() {
  const loaded = (await import("isomorphic-mermaid")).default;
  const svgWindow = globalThis.window as Window & { location?: Location };
  if (!svgWindow.location) {
    Object.defineProperty(svgWindow, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "localhost",
        hostname: "localhost",
        pathname: "/",
        search: "",
        hash: "",
        href: "http://localhost/",
        origin: "http://localhost",
      },
    });
  }
  return loaded;
}

function loadMermaid() {
  mermaidPromise ??= importMermaid();
  return mermaidPromise;
}

function classNames(node: HastNode) {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/\s+/) : [];
}

function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textContent).join("") ?? "";
}

function collectTargets(node: HastNode, targets: MermaidTarget[]) {
  for (let index = 0; index < (node.children?.length ?? 0); index += 1) {
    const child = node.children![index];
    const code = child.tagName === "pre" && child.children?.length === 1 ? child.children[0] : undefined;
    if (code?.tagName === "code" && classNames(code).includes("language-mermaid")) {
      const source = textContent(code).trim();
      const digest = createHash("sha256").update(source).digest("hex").slice(0, 12);
      targets.push({
        parent: node,
        index,
        code,
        source,
        id: `mermaid-${digest}-${targets.length + 1}`,
      });
      continue;
    }
    collectTargets(child, targets);
  }
}

function assertSafeSvg(svg: string) {
  if (!svg.trimStart().startsWith("<svg")) throw new Error("Mermaid 没有生成有效 SVG。");
  if (
    /<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)
    || /\son[a-z]+\s*=/i.test(svg)
    || /(?:href|src)\s*=\s*["']\s*javascript:/i.test(svg)
  ) {
    throw new Error("Mermaid SVG 包含不安全内容。");
  }
}

function parseSvg(svg: string): HastNode {
  assertSafeSvg(svg);
  const root = fromHtml(svg, { fragment: true }) as HastNode;
  const element = root.children?.find((child) => child.tagName === "svg");
  if (!element) throw new Error("Mermaid SVG 解析失败。");
  return withIntrinsicWidth(element);
}

/**
 * 把 viewBox 的宽度写成显式像素值。
 *
 * mermaid 输出的 SVG 只带 viewBox 和 `max-width`，浏览器把它当替换元素处理：
 * 没有显式宽度时一律填满容器，于是 1899px 的图被压进 630px 的正文栏，
 * 节点文字的有效字号只剩约 5px（实测）。
 *
 * CSS 侧无解——`width: auto` / `max-content` / `fit-content` 对带 viewBox 的
 * SVG 全都解析成「填满容器」，三个值都实测过。只有显式像素宽度有效。
 *
 * 写上之后图按 1:1 渲染，超出正文栏时由容器的 overflow-x 横向滚动，
 * 这也正是那条 overflow-x 原本的意图。
 */
function withIntrinsicWidth(element: HastNode): HastNode {
  const viewBox = element.properties?.viewBox;
  if (typeof viewBox !== "string") return element;

  // viewBox = "minX minY width height"
  const width = Number.parseFloat(viewBox.trim().split(/\s+/)[2] ?? "");
  if (!Number.isFinite(width) || width <= 0) return element;

  const style = typeof element.properties?.style === "string" ? element.properties.style : "";
  element.properties = {
    ...element.properties,
    // 保留 mermaid 自带的 max-width，再补上显式宽度；显式宽度在后，优先生效。
    style: `${style}${style && !style.trimEnd().endsWith(";") ? ";" : ""}width:${Math.round(width)}px;`,
  };
  return element;
}

async function renderSvg(source: string, id: string, theme: "default" | "dark") {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    theme,
    deterministicIds: true,
    deterministicIDSeed: id,
    maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
  });
  const { svg } = await mermaid.render(`${id}-${theme}`, source);
  return parseSvg(svg);
}

async function renderTarget(target: MermaidTarget) {
  if (!target.source) throw new Error("Mermaid 代码块不能为空。");
  if (target.source.length > MAX_MERMAID_SOURCE_LENGTH) {
    throw new Error(`Mermaid 图表不能超过 ${MAX_MERMAID_SOURCE_LENGTH} 个字符。`);
  }

  const light = await renderSvg(target.source, target.id, "default");
  const dark = await renderSvg(target.source, target.id, "dark");
  target.parent.children![target.index] = {
    type: "element",
    tagName: "figure",
    properties: {
      className: ["mermaid-diagram"],
      ariaLabel: "Mermaid 图表",
    },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["mermaid-light"] },
        children: [light],
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["mermaid-dark"] },
        children: [dark],
      },
    ],
  };
}

function fallbackToCode(target: MermaidTarget) {
  const pre = target.parent.children?.[target.index];
  if (!pre) return;

  target.code.properties = {
    ...target.code.properties,
    // Shiki 不保证提供 Mermaid grammar。退回纯文本，避免坏图又在高亮阶段失败。
    className: ["language-text"],
  };
  target.parent.children![target.index] = {
    type: "element",
    tagName: "div",
    properties: {
      className: ["mermaid-fallback"],
      role: "note",
    },
    children: [
      {
        type: "element",
        tagName: "p",
        properties: { className: ["mermaid-fallback-note"] },
        children: [
          {
            type: "text",
            value: "Mermaid 图表未能渲染，下面保留原始代码。",
          },
        ],
      },
      pre,
    ],
  };
}

/**
 * 把 ```mermaid 代码块在保存/重刷时烘成双主题内联 SVG。
 * Mermaid 依赖进程级 DOM，因此串行渲染，避免并发保存时互相污染 document。
 */
export function rehypeServerMermaid() {
  return async (tree: HastNode) => {
    const targets: MermaidTarget[] = [];
    collectTargets(tree, targets);
    if (!targets.length) return;

    const task = renderQueue.then(async () => {
      for (const [index, target] of targets.entries()) {
        if (index >= MAX_MERMAID_DIAGRAMS) {
          fallbackToCode(target);
          console.warn(
            `[markdown] Mermaid diagram ${index + 1} was preserved as code: `
              + `the per-post limit is ${MAX_MERMAID_DIAGRAMS}`,
          );
          continue;
        }

        try {
          await renderTarget(target);
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          fallbackToCode(target);
          console.warn(
            `[markdown] Mermaid diagram ${index + 1} was preserved as code: ${message}`,
          );
        }
      }
    });
    renderQueue = task.catch(() => undefined);
    await task;
  };
}
