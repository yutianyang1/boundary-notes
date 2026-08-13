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

const article = {
  slug: "normalization-layers-batchnorm-layernorm-groupnorm",
  title: "BatchNorm、LayerNorm、GroupNorm：区别只在一个维度",
  summary:
    "三种归一化做的是同一件事——减均值、除标准差、再仿射，唯一的区别是统计量在哪些维度上求。想透这一点，选型、Transformer 为何弃用 BN、以及推理时能否折叠，都成了推论。",
  seoTitle: "BatchNorm / LayerNorm / GroupNorm 的区别：统计量在哪些维度上求",
  seoDescription:
    "用统一视角讲清 BatchNorm、LayerNorm、GroupNorm、InstanceNorm 的本质区别、各自适用场景，以及归一化在推理时能否折叠进权重的成本差异。",
  cover: null as string | null,
  categorySlug: "inference-optimization",
  categoryName: "推理优化",
  tagNames: ["归一化", "深度学习", "Transformer", "推理优化"],
  source: path.join(
    process.cwd(),
    "docs",
    "articles",
    "normalization-layers.md",
  ),
};

async function main() {
  const contentMd = await readFile(article.source, "utf8");
  const contentHtml = await renderMarkdown(contentMd);

  const [author] =
    (await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
      .limit(1)) ?? [];
  const [fallbackAuthor] = author
    ? [author]
    : await db.select({ id: users.id }).from(users).where(isNull(users.deletedAt)).limit(1);
  const activeAuthor = author ?? fallbackAuthor;
  if (!activeAuthor) throw new Error("No active author is available.");

  // 分类不存在则创建（inference-optimization / 推理优化）。
  let [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, article.categorySlug), isNull(categories.deletedAt)))
    .limit(1);
  if (!category) {
    [category] = await db
      .insert(categories)
      .values({ slug: article.categorySlug, name: article.categoryName })
      .onConflictDoNothing()
      .returning({ id: categories.id });
  }
  if (!category) {
    [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, article.categorySlug), isNull(categories.deletedAt)))
      .limit(1);
  }
  if (!category) throw new Error(`Unable to resolve category: ${article.categorySlug}`);

  const result = await db.transaction(async (tx) => {
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
          cover: article.cover,
          status: "published",
          categoryId: category.id,
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
          cover: article.cover,
          status: "published",
          pinned: false,
          authorId: activeAuthor.id,
          categoryId: category.id,
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
      const slug = normalizeSlug(name);
      let [tag] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
        .limit(1);

      if (!tag) {
        [tag] = await tx
          .insert(tags)
          .values({ name, slug })
          .onConflictDoNothing()
          .returning({ id: tags.id });
      }
      if (!tag) {
        [tag] = await tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
          .limit(1);
      }
      if (!tag) throw new Error(`Unable to resolve tag: ${name}`);
      await tx
        .insert(postTags)
        .values({ postId, tagId: tag.id })
        .onConflictDoNothing();
    }

    await tx.insert(postRevisions).values({
      postId,
      revision: nextRevision,
      title: article.title,
      summary: article.summary,
      contentMd,
      status: "published",
      isPublishedVersion: true,
      createdBy: activeAuthor.id,
    });

    await tx.insert(auditLogs).values({
      actorId: activeAuthor.id,
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
        cover: article.cover,
        tags: article.tagNames,
        source: "content-script",
      },
    });

    return { id: postId, revision: nextRevision, operation: existing ? "updated" : "created" };
  });

  console.log(
    `[content:publish-normalization] ${result.operation} ${article.slug} `
      + `(id=${result.id}, revision=${result.revision}, renderer=v${rendererVersion})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
