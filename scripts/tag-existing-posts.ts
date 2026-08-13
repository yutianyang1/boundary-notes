import { and, eq, isNull } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import { postTags, posts, tags } from "@/lib/db/schema";
import { normalizeSlug } from "@/lib/posts/slug";

const assignments: Record<string, string[]> = {
  "flash-attention": ["Attention", "GPU", "推理优化"],
  "paged-attention": ["KV Cache", "vLLM", "推理优化"],
  "hotword-paraformer": ["语音识别", "FunASR", "热词"],
};

async function main() {
  let relationCount = 0;

  await db.transaction(async (tx) => {
    for (const [postSlug, tagNames] of Object.entries(assignments)) {
      const [post] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.slug, postSlug), isNull(posts.deletedAt)))
        .limit(1);

      if (!post) {
        console.warn(`[content:tag-existing] Post not found: ${postSlug}`);
        continue;
      }

      for (const name of tagNames) {
        const slug = normalizeSlug(name);

        await tx
          .insert(tags)
          .values({ name, slug })
          .onConflictDoNothing();

        const [tag] = await tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
          .limit(1);

        if (!tag) {
          throw new Error(`Unable to resolve tag after insert: ${name}`);
        }

        const inserted = await tx
          .insert(postTags)
          .values({ postId: post.id, tagId: tag.id })
          .onConflictDoNothing()
          .returning({ postId: postTags.postId });

        relationCount += inserted.length;
      }
    }
  });

  console.log(
    `[content:tag-existing] Completed; added ${relationCount} missing relation(s).`,
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
