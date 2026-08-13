import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { Root } from "mdast";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { rehypeServerMermaid } from "./mermaid";

type DirectiveNode = {
  type: "containerDirective" | "leafDirective" | "textDirective";
  name: string;
  attributes?: Record<string, string>;
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

function remarkSafeDirectives() {
  return (tree: Root) => {
    visit(tree, ["containerDirective", "leafDirective", "textDirective"], (rawNode) => {
      const node = rawNode as DirectiveNode;
      if (node.type === "containerDirective" && ["note", "warning"].includes(node.name)) {
        node.data = {
          hName: "div",
          hProperties: { className: [`directive-${node.name}`], role: "note" },
        };
        return;
      }

      node.data = { hName: "span", hProperties: { className: ["unsupported-directive"] } };
    });
  };
}

const sanitizeSchema = {
  ...defaultSchema,
  // 放行图注结构：defaultSchema 不含 figure/figcaption
  tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption"],
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "className", "role"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    // defaultSchema 只允许 img 的 src，会把 alt/尺寸/懒加载全部剥掉
    img: [...(defaultSchema.attributes?.img ?? []), "alt", "width", "height", "loading"],
  },
} satisfies typeof defaultSchema;

/**
 * 渲染管线版本。任何会改变输出 HTML 的插件/配置变更都必须 +1，
 * 之后按 posts.renderer_version 批量重刷 content_html。
 *
 * v2: 加入 remark-gfm（表格、删除线、任务列表、自动链接）。
 *     v1 没有它，Markdown 表格会原样输出管道符。
 * v3: 引入 rehype-raw + 放行 figure/figcaption 与 img 的 alt/尺寸属性，
 *     正式支持作者用 <figure>/<figcaption> 写带图注的插图（sanitize 仍在其后兜底）。
 * v4: 给 h2–h4 生成可供目录定位的安全 id。
 * v5: 把 mermaid 代码块服务端预渲染为双主题内联 SVG。
 * v6: Mermaid 单图渲染失败时保留已转义的原始代码块，不阻断文章保存或重刷。
 * v7: 加入 remark-math + rehype-katex 数学公式。
 */
export const rendererVersion = 7;

export async function renderMarkdown(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkSafeDirectives)
    // allowDangerousHtml + rehypeRaw 让作者可写 <figure> 等原始 HTML；
    // 紧随其后的 rehypeSanitize 才是真正的安全边界，白名单之外一律剥离。
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeSanitize, sanitizeSchema)
    // rehype-katex v7 内部捕获解析异常，并以 throwOnError:false 生成 katex-error；
    // 其公开 Options 已刻意移除 throwOnError，这里只配置严格模式。
    .use(rehypeKatex, { strict: "ignore" })
    .use(rehypeServerMermaid)
    .use(rehypeShiki, {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    })
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}
