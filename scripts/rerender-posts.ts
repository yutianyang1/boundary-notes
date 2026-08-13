import { and, eq, lt } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { posts } from "../lib/db/schema";
import { renderMarkdown, rendererVersion } from "../lib/markdown/render";

async function main() {
  const stalePosts = await db
    .select({ id: posts.id, slug: posts.slug, contentMd: posts.contentMd })
    .from(posts)
    .where(lt(posts.rendererVersion, rendererVersion));

  let updated = 0;
  const failed: Array<{ id: string; slug: string; error: string }> = [];
  for (const post of stalePosts) {
    try {
      const contentHtml = await renderMarkdown(post.contentMd);
      await db
        .update(posts)
        .set({ contentHtml, rendererVersion })
        .where(and(eq(posts.id, post.id), lt(posts.rendererVersion, rendererVersion)));
      updated += 1;
    } catch (error) {
      failed.push({
        id: post.id,
        slug: post.slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write(
    `Re-rendered ${updated} post(s) at renderer v${rendererVersion}; `
      + `${failed.length} failed.\n`,
  );
  for (const failure of failed) {
    process.stderr.write(
      `[content:rerender] ${failure.slug} (${failure.id}): ${failure.error}\n`,
    );
  }
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
