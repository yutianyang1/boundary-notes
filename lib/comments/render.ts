import type { Element, Root } from "hast";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const commentSchema = {
  tagNames: ["p", "br", "strong", "em", "code", "pre", "blockquote", "a"],
  attributes: { a: ["href"] },
  protocols: { href: ["http", "https"] },
};

function hardenCommentLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      node.properties.rel = ["nofollow", "ugc", "noopener"];
      node.properties.target = "_blank";
    });
  };
}

export async function renderComment(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, commentSchema)
    .use(hardenCommentLinks)
    .use(rehypeStringify)
    .process(markdown);
  return String(result);
}
