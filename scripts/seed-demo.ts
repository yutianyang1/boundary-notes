/**
 * 本地开发用的示例数据。生产环境不要运行。
 * 用法：DATABASE_URL=... npx tsx scripts/seed-demo.ts
 *
 * 会先清空所有文章与分类，再写入 scripts/demo-content 下的三篇文章。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, pool } from "../lib/db";
import { categories, posts, users } from "../lib/db/schema";
import { renderMarkdown, rendererVersion } from "../lib/markdown/render";

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(`./demo-content/${file}`, import.meta.url)), "utf8").trim();

const seedCategories = [
  { slug: "inference-optimization", name: "推理优化" },
  { slug: "speech-recognition", name: "语音识别" },
];

const seedPosts = [
  {
    slug: "flash-attention",
    title: "FlashAttention：把注意力的瓶颈从算力挪回访存",
    summary:
      "注意力慢在访存，不在算力。FlashAttention 把 Q/K/V 分块搬进 SRAM，用在线 softmax 保证分块结果与整行 softmax 逐位相等，N×N 中间矩阵从不落地显存。",
    category: "inference-optimization",
    file: "flash-attention.md",
    publishedAt: "2026-07-22T02:00:00Z",
    pinned: true,
  },
  {
    slug: "paged-attention",
    title: "PagedAttention：用操作系统分页管好 KV 缓存",
    summary:
      "KV 缓存的连续预分配会造成大量显存碎片，压低并发。vLLM 借用操作系统分页：KV 切成固定大小的块、用块表映射逻辑到物理，浪费压到一个块以内，相同前缀还能写时复制共享。",
    category: "inference-optimization",
    file: "paged-attention.md",
    publishedAt: "2026-07-18T02:00:00Z",
    pinned: false,
  },
  {
    slug: "hotword-paraformer",
    title: "热词版 Paraformer：让人名和术语被正确认出来",
    summary:
      "Paraformer 用 CIF 预测器解决了非自回归识别的长度对齐，得以一次并行输出整句。热词版再挂一条偏置注意力分支，推理时传入词表即可让人名、术语这些低频定制词被正确召回。",
    category: "speech-recognition",
    file: "hotword-paraformer.md",
    publishedAt: "2026-07-10T02:00:00Z",
    pinned: false,
  },
];

async function main() {
  const [author] = await db.select({ id: users.id }).from(users).limit(1);
  if (!author) throw new Error("先运行 db:seed 创建管理员账号");

  // 清空旧数据：删除文章（级联清理修订/评论/标签/重定向），再删除分类
  await db.delete(posts);
  await db.delete(categories);

  const categoryIds = new Map<string, string>();
  for (const category of seedCategories) {
    const [created] = await db.insert(categories).values(category).returning({ id: categories.id });
    categoryIds.set(category.slug, created.id);
  }

  for (const post of seedPosts) {
    const contentMd = read(post.file);
    await db.insert(posts).values({
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      contentMd,
      // 走真实渲染管线，否则文章页的正文样式（含插图）等于没被验证过
      contentHtml: await renderMarkdown(contentMd),
      rendererVersion,
      status: "published" as const,
      pinned: post.pinned,
      authorId: author.id,
      categoryId: categoryIds.get(post.category)!,
      publishedAt: new Date(post.publishedAt),
    });
  }

  process.stdout.write(`示例数据就绪：${seedPosts.length} 篇文章 / ${seedCategories.length} 个分类\n`);
}

main().finally(() => pool.end());
