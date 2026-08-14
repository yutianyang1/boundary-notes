/**
 * 把中文标签 slug 迁移为英文。
 *
 *   npx tsx scripts/migrate-tag-slugs.ts          # 预览，不写库
 *   npx tsx scripts/migrate-tag-slugs.ts --apply  # 实际写入
 *
 * 映射表在 lib/posts/slug-redirects.ts，与中间件的 301 共用同一份数据，
 * 两边因此不会走偏。
 *
 * 顺序要求：先部署带 301 的代码，再跑这个脚本。反过来的话，
 * 在代码上线之前旧地址会直接 404。
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { TAG_SLUG_REDIRECTS } from "@/lib/posts/slug-redirects";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "写入模式" : "预览模式（加 --apply 才会写库）\n");

  const rows = await db.select({ id: tags.id, slug: tags.slug, name: tags.name }).from(tags);
  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  let planned = 0;
  let skipped = 0;
  const conflicts: string[] = [];
  const plans: Array<{ id: string; name: string; oldSlug: string; newSlug: string }> = [];

  for (const [oldSlug, newSlug] of Object.entries(TAG_SLUG_REDIRECTS)) {
    const row = bySlug.get(oldSlug);
    if (!row) {
      // 已经迁过，或这个标签本来就不存在。
      skipped += 1;
      continue;
    }
    if (bySlug.has(newSlug)) {
      conflicts.push(`${oldSlug} → ${newSlug}：目标 slug 已被占用`);
      continue;
    }
    planned += 1;
    plans.push({ id: row.id, name: row.name, oldSlug, newSlug });
    console.log(`  ✓ ${row.name}: ${oldSlug} → ${newSlug}`);
  }

  if (conflicts.length) {
    for (const conflict of conflicts) console.error(`  ✗ ${conflict}`);
    throw new Error(`发现 ${conflicts.length} 个目标 slug 冲突，未写入任何数据。`);
  }

  if (apply && plans.length) {
    await db.transaction(async (tx) => {
      for (const plan of plans) {
        const [updated] = await tx.update(tags)
          .set({ slug: plan.newSlug })
          .where(and(eq(tags.id, plan.id), eq(tags.slug, plan.oldSlug)))
          .returning({ id: tags.id });
        if (!updated) throw new Error(`标签 ${plan.name} 在迁移期间发生变化，事务已回滚。`);
      }
    });
  }

  console.log(`\n共 ${rows.length} 个标签，${planned} 个待迁移，${skipped} 个无需处理。`);
  if (!apply) {
    console.log("未写入任何数据。确认无误后加 --apply 重跑。");
  } else if (planned) {
    console.log("已写入。旧地址由中间件 301 到新地址，无需额外操作。");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
