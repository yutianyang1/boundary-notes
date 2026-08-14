/**
 * 给分类和标签补英文展示名。
 *
 *   npx tsx scripts/set-taxonomy-names-en.ts          # 预览，不写库
 *   npx tsx scripts/set-taxonomy-names-en.ts --apply  # 实际写入
 *
 * 后台没有分类/标签的管理界面（它们随文章创建），所以英文名在这里维护。
 * 系列有后台表单，不需要走这个脚本。
 *
 * 按 slug 匹配。留空或不在表里的条目保持无英文名，英文站会回退到中文。
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, tags } from "@/lib/db/schema";
import { TAG_SLUG_REDIRECTS } from "@/lib/posts/slug-redirects";

/** slug -> 英文名。新增分类后在这里补一行即可。 */
const CATEGORY_NAMES_EN: Record<string, string> = {
  "inference-optimization": "Inference optimisation",
  "speech-recognition": "Speech recognition",
  "model-architecture": "Model architecture",
};

const TAG_NAMES_EN: Record<string, string> = {
  attention: "Attention",
  transformer: "Transformer",
  kimi: "Kimi",
  "barge-in": "Barge-in",
  vllm: "vLLM",
  推理优化: "Inference optimisation",
  语音识别: "Speech recognition",
  大模型: "Large language models",
  实时音频: "Real-time audio",
  归一化: "Normalisation",
  数字人: "Conversational avatars",
  残差连接: "Residual connections",
  注意力机制: "Attention mechanisms",
  深度学习: "Deep learning",
  深度网络: "Deep networks",
  热词: "Hotwords",
  稀疏模型: "Sparse models",
  系统架构: "System architecture",
  线性注意力: "Linear attention",
  长上下文: "Long context",
};

// slug 迁移前后都能重跑：英文 slug 复用对应旧中文 slug 的译名。
const TAG_NAMES_EN_BY_ANY_SLUG: Record<string, string> = { ...TAG_NAMES_EN };
for (const [oldSlug, newSlug] of Object.entries(TAG_SLUG_REDIRECTS)) {
  const name = TAG_NAMES_EN[oldSlug];
  if (name) TAG_NAMES_EN_BY_ANY_SLUG[newSlug] = name;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "写入模式" : "预览模式（加 --apply 才会写库）");

  for (const [table, mapping, label] of [
    [categories, CATEGORY_NAMES_EN, "分类"],
    [tags, TAG_NAMES_EN_BY_ANY_SLUG, "标签"],
  ] as const) {
    const rows = await db.select({ slug: table.slug, name: table.name, nameEn: table.nameEn }).from(table);
    let planned = 0;
    let missing = 0;

    for (const row of rows) {
      const target = mapping[row.slug];
      if (!target) {
        missing += 1;
        console.log(`  · ${label} ${row.slug} (${row.name}) — 未提供英文名，英文站沿用中文`);
        continue;
      }
      if (row.nameEn === target) continue;
      planned += 1;
      console.log(`  ✓ ${label} ${row.slug}: ${row.name} → ${target}`);
      if (apply) {
        await db.update(table).set({ nameEn: target }).where(eq(table.slug, row.slug));
      }
    }
    console.log(`  ${label}: ${rows.length} 条，${planned} 条待更新，${missing} 条无英文名\n`);
  }

  if (!apply) console.log("未写入任何数据。确认无误后加 --apply 重跑。");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
