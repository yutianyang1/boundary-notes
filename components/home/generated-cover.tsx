import type { CSSProperties } from "react";

/**
 * 程序化兜底封面：没有 cover 图的文章、分类、系列都用它。
 *
 * 图版由两个正交的维度决定：
 *
 * - **母题**（图形本身）按 `group` 取，调用方传分类/系列 slug。同一个分类下的
 *   文章因此共用一种图形，一页看下来像一套体系而不是一堆随机图。没有 group
 *   时退回 seed，至少还能各不相同。
 * - **色相**按 seed（文章 slug）取。所以同分类内的两篇文章图形相同、颜色不同，
 *   既成套又不撞脸。
 *
 * 两个维度各自加盐后独立求哈希，避免「母题一样的必然色相也一样」。
 */

/** 母题数量，与 globals.css 里的 .generated-cover-m0…m5 一一对应。 */
const MOTIF_COUNT = 6;

/**
 * 色相环上大致等距的 8 个点（OKLCH 色相，间隔约 40°）。
 *
 * 上一版是 264/286/300/330 挤在靛蓝到品红一段、186/208 又挨着，8 个里一半
 * 看起来是「偏紫」。线上分类页三张全紫、搜索结果三张冷色竖条就是这么来的。
 * 数组顺序按 hueIndex 每次跳 3 格排过：依次取到靛蓝、橙红、青、紫、琥珀、蓝、
 * 粉、绿，相邻两张冷暖交替。
 */
const HUES = [264, 305, 350, 30, 70, 150, 190, 230];

/**
 * 构图焦点的横向位置。
 *
 * 母题按分类走，所以同一个分类下的几篇文章图形是一样的——那是有意的，一页看
 * 下来才成套。但光靠色相区分，三张「模型架构」摆在一起仍像同一张图换了颜色。
 * 再挪一下图案的聚焦点，家族感保留，撞脸没有了。
 */
const FOCUS = ["36%", "54%", "72%", "88%"];

/**
 * FNV-1a 加末尾雪崩。
 *
 * 旧实现是 `hash = hash * 31 + c` 然后 `% 5`。31 对 5 取模等于 1，于是整条
 * 多项式哈希在模 5 意义下退化成「所有码点直接相加」，位置信息全部丢失——站内
 * 6 篇文章里有 5 篇撞进了同一个变体，五选一实际只用到两个。这里换成 FNV 的
 * 质数乘子，并在最后做两轮移位异或把高位搅进低位，取模时不再和乘子共因子。
 */
function hashOf(seed: string) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

export function GeneratedCover({
  title,
  label,
  seed,
  group,
  hueIndex,
  className = "",
  patternOnly = false,
  showTitle = true,
  alt,
}: {
  title: string;
  label?: string | null;
  seed: string;
  /** 决定母题的分组键，通常是分类/系列 slug；留空则退回 seed。 */
  group?: string | null;
  /**
   * 列表里的序号。给了就按序号取色相，不再按 seed 哈希。
   *
   * 分类、系列这种一页只有三五张卡片的列表，哈希取色很容易让相邻几张落进同一
   * 片色区（线上分类页三张全是紫色）。按序号每次在色相表里跳 3 格，8 个色相
   * 走完一圈前不会重复，相邻两张始终隔着 135°。
   */
  hueIndex?: number;
  className?: string;
  patternOnly?: boolean;
  /**
   * 是否在封面上印标题。紧挨着封面下方就是同一个标题时（文章页头、分类卡片）
   * 应该关掉，否则读者会连着看到两遍。
   */
  showTitle?: boolean;
  alt?: string;
}) {
  const motif = hashOf(`motif:${group || seed}`) % MOTIF_COUNT;
  const hue = hueIndex === undefined
    ? HUES[hashOf(`hue:${seed}`) % HUES.length]
    : HUES[(hueIndex * 3) % HUES.length];
  const focus = FOCUS[hashOf(`focus:${seed}`) % FOCUS.length];
  const hasText = !patternOnly && (showTitle || Boolean(label));

  return (
    <div
      role={patternOnly ? undefined : "img"}
      aria-hidden={patternOnly || undefined}
      aria-label={patternOnly ? undefined : alt ?? title}
      className={`generated-cover generated-cover-m${motif} ${className}`}
      style={{ "--cover-hue": hue, "--cover-x": focus } as CSSProperties}
    >
      {hasText ? (
        <div className="absolute inset-x-[7%] bottom-[9%] max-w-[78%]">
          {label ? (
            <span className="mb-2 block text-[0.65rem] font-semibold tracking-[0.14em] text-indigo-200/75 sm:text-xs">
              {label}
            </span>
          ) : null}
          {showTitle ? (
            /* 标题来自文章内容，语言随正文而非界面。 */
            <span lang="zh-CN" className="line-clamp-2 block text-base font-extrabold leading-tight text-balance sm:text-xl">
              {title}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
