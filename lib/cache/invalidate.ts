"use server";

import { updateTag } from "next/cache";
import { cacheTags, postMutationTags } from "./tags";

export async function invalidatePostAfterMutation(
  slug: string,
  tagSlugs: string[] = [],
  seriesSlugs: string[] = [],
) {
  for (const tag of postMutationTags(slug)) updateTag(tag);
  for (const tagSlug of tagSlugs) updateTag(cacheTags.tag(tagSlug));
  for (const seriesSlug of seriesSlugs) updateTag(cacheTags.series(seriesSlug));
}
