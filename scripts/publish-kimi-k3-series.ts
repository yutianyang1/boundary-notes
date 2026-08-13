import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import {
  auditLogs,
  categories,
  postRevisions,
  posts,
  postTags,
  tags,
  users,
} from "@/lib/db/schema";
import { renderMarkdown, rendererVersion } from "@/lib/markdown/render";
import { normalizeSlug } from "@/lib/posts/slug";

type Article = {
  slug: string;
  title: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  tagNames: string[];
  file: string;
};

const category = { slug: "model-architecture", name: "模型架构" };

const articles: Article[] = [
  {
    slug: "kimi-delta-attention",
    title: "Kimi Delta Attention：把遗忘门做到每个通道",
    summary:
      "线性注意力想免掉 KV cache 的税，却一直打不过 full attention。KDA 只改了一件事——把 Gated DeltaNet 的标量遗忘门细化到逐通道，再配 3:1 混合全注意力，把线性注意力拉到能挑大梁的位置。",
    seoTitle: "Kimi Delta Attention（KDA）原理：逐通道遗忘门与 3:1 混合注意力",
    seoDescription:
      "解析 Kimi K3 的 Kimi Delta Attention：从线性注意力、Delta rule、Gated DeltaNet 讲到 KDA 的逐通道对角遗忘门、q/k 短卷积+L2 归一化、分块并行，以及为何保留 1/4 full attention。",
    tagNames: ["Kimi", "线性注意力", "注意力机制", "长上下文"],
    file: "kimi-delta-attention.md",
  },
  {
    slug: "attention-residuals",
    title: "Attention Residuals：让每一层自己决定回头翻哪一层",
    summary:
      "残差连接十年没变——每层只读上一层，深了之后早期信号被一路加法稀释。AttnRes 给每层一个零初始化的 pseudo-query，让它在所有历史层输出上做注意力、按需聚合，只花约 4%/2% 开销。",
    seoTitle: "Attention Residuals（AttnRes）原理：用 pseudo-query 做跨层注意力残差",
    seoDescription:
      "解析 Kimi K3 的 Attention Residuals：为何标准残差只读上一层是瓶颈，AttnRes 如何用每层一个零初始化 pseudo-query 在历史层输出上做注意力聚合，以及它与 DenseNet、Hyper-Connections 的关系。",
    tagNames: ["Kimi", "残差连接", "Transformer", "深度网络"],
    file: "attention-residuals.md",
  },
  {
    slug: "stable-latent-moe",
    title: "Stable LatentMoE：896 选 16 的极端稀疏怎么才不训崩",
    summary:
      "MoE 越稀疏越省算力，也越容易训崩。K3 把稀疏度推到 896 选 16（不到 2% 激活），靠归一化、SiTU-GLU、Quantile Balancing 三个稳定器把它拉住——名字里的 Stable 才是重点。",
    seoTitle: "Stable LatentMoE 原理：896 选 16 极端稀疏 MoE 的三个稳定器",
    seoDescription:
      "解析 Kimi K3 的 Stable LatentMoE：Latent 潜在压缩为何能养 896 个专家，极端稀疏难在哪，以及归一化、SiTU-GLU、Quantile Balancing 如何分别摁住激活漂移、专家分工与路由崩塌。",
    tagNames: ["Kimi", "MoE", "稀疏模型", "大模型"],
    file: "stable-latent-moe.md",
  },
];

async function resolveAuthor() {
  const [admin] =
    (await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
      .limit(1)) ?? [];
  if (admin) return admin.id;
  const [fallback] = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.deletedAt))
    .limit(1);
  if (!fallback) throw new Error("No active author is available.");
  return fallback.id;
}

async function resolveCategory() {
  let [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, category.slug), isNull(categories.deletedAt)))
    .limit(1);
  if (!row) {
    [row] = await db
      .insert(categories)
      .values({ slug: category.slug, name: category.name })
      .onConflictDoNothing()
      .returning({ id: categories.id });
  }
  if (!row) {
    [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, category.slug), isNull(categories.deletedAt)))
      .limit(1);
  }
  if (!row) throw new Error(`Unable to resolve category: ${category.slug}`);
  return row.id;
}

async function resolveTag(name: string) {
  const slug = normalizeSlug(name);
  let [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
    .limit(1);
  if (!tag) {
    [tag] = await db
      .insert(tags)
      .values({ name, slug })
      .onConflictDoNothing()
      .returning({ id: tags.id });
  }
  if (!tag) {
    [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
      .limit(1);
  }
  if (!tag) throw new Error(`Unable to resolve tag: ${name}`);
  return tag.id;
}

async function publish(article: Article, authorId: string, categoryId: string) {
  const source = path.join(process.cwd(), "docs", "articles", article.file);
  const contentMd = await readFile(source, "utf8");
  const contentHtml = await renderMarkdown(contentMd);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.slug, article.slug), isNull(posts.deletedAt)))
      .limit(1);

    const nextRevision = existing ? existing.revision + 1 : 1;
    let postId: string;

    if (existing) {
      postId = existing.id;
      await tx
        .update(posts)
        .set({
          title: article.title,
          summary: article.summary,
          contentMd,
          contentHtml,
          rendererVersion,
          cover: null,
          status: "published",
          categoryId,
          revision: nextRevision,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          publishedAt: existing.publishedAt ?? new Date(),
          scheduledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, existing.id));
    } else {
      const [created] = await tx
        .insert(posts)
        .values({
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          contentMd,
          contentHtml,
          rendererVersion,
          cover: null,
          status: "published",
          pinned: false,
          authorId,
          categoryId,
          revision: nextRevision,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          publishedAt: new Date(),
        })
        .returning({ id: posts.id });
      postId = created.id;
    }

    await tx.delete(postTags).where(eq(postTags.postId, postId));
    for (const name of article.tagNames) {
      const tagId = await resolveTag(name);
      await tx.insert(postTags).values({ postId, tagId }).onConflictDoNothing();
    }

    await tx.insert(postRevisions).values({
      postId,
      revision: nextRevision,
      title: article.title,
      summary: article.summary,
      contentMd,
      status: "published",
      isPublishedVersion: true,
      createdBy: authorId,
    });

    await tx.insert(auditLogs).values({
      actorId: authorId,
      action: existing ? "post.update" : "post.create",
      targetType: "post",
      targetId: postId,
      before: existing
        ? { title: existing.title, status: existing.status, revision: existing.revision }
        : null,
      after: {
        slug: article.slug,
        title: article.title,
        status: "published",
        revision: nextRevision,
        tags: article.tagNames,
        source: "content-script",
      },
    });

    return { id: postId, revision: nextRevision, operation: existing ? "updated" : "created" };
  });
}

async function main() {
  const authorId = await resolveAuthor();
  const categoryId = await resolveCategory();
  for (const article of articles) {
    const result = await publish(article, authorId, categoryId);
    console.log(
      `[content:publish-kimi-k3] ${result.operation} ${article.slug} `
        + `(id=${result.id}, revision=${result.revision}, renderer=v${rendererVersion})`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
