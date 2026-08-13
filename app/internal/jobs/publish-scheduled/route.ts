import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { cacheTags, postMutationTags } from "@/lib/cache/tags";
import { db } from "@/lib/db";
import { auditLogs, jobRuns, posts, postTags, tags } from "@/lib/db/schema";
import { enqueuePostBroadcast } from "@/lib/subscribe/service";

function hasValidSecret(request: Request) {
  const expected = process.env.JOB_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const runId = crypto.randomUUID();

  try {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtext('publish-scheduled-posts')) as locked`,
      );
      if (!lockResult.rows[0]?.locked) {
        await tx.insert(jobRuns).values({
          id: runId,
          jobName: "publish-scheduled-posts",
          status: "skipped",
          finishedAt: new Date(),
          details: { reason: "lock-not-acquired" },
        });
        return { skipped: true as const, published: [], tagSlugs: [] };
      }

      const published = await tx.update(posts).set({ status: "published", updatedAt: new Date() }).where(and(
        eq(posts.status, "scheduled"),
        lte(posts.publishedAt, new Date()),
        isNull(posts.deletedAt),
      )).returning({ id: posts.id, slug: posts.slug });

      for (const post of published) await enqueuePostBroadcast(tx, post.id);

      await tx.insert(jobRuns).values({
        id: runId,
        jobName: "publish-scheduled-posts",
        status: "succeeded",
        finishedAt: new Date(),
        affectedCount: published.length,
        details: { slugs: published.map((post) => post.slug) },
      });
      if (published.length) {
        await tx.insert(auditLogs).values({
          action: "scheduled.publish",
          targetType: "job_run",
          targetId: runId,
          after: { postIds: published.map((post) => post.id) },
        });
      }
      const publishedTagRows = published.length
        ? await tx.selectDistinct({ slug: tags.slug })
            .from(postTags)
            .innerJoin(tags, eq(postTags.tagId, tags.id))
            .where(and(inArray(postTags.postId, published.map((post) => post.id)), isNull(tags.deletedAt)))
        : [];
      return { skipped: false as const, published, tagSlugs: publishedTagRows.map((row) => row.slug) };
    });

    if (result.skipped) return NextResponse.json({ status: "skipped", published: 0 });

    const cacheTagSet = new Set<string>([cacheTags.posts, cacheTags.feed, cacheTags.sitemap]);
    for (const post of result.published) {
      for (const tag of postMutationTags(post.slug)) cacheTagSet.add(tag);
    }
    for (const tag of result.tagSlugs) cacheTagSet.add(cacheTags.tag(tag));
    for (const tag of cacheTagSet) revalidateTag(tag, { expire: 0 });

    return NextResponse.json({ status: "succeeded", published: result.published.length });
  } catch (error) {
    console.error("publish-scheduled-posts failed", error);
    return NextResponse.json({ error: "job_failed", runId }, { status: 500 });
  }
}
