import Image from "next/image";
import Link from "next/link";
import { GeneratedCover } from "@/components/home/generated-cover";

export function TermCard({
  href,
  name,
  description,
  countLabel,
  cover,
  seed,
  label,
}: {
  href: string;
  name: string;
  description?: string | null;
  /** 已翻译好的数量文案。 */
  countLabel: string;
  cover?: string | null;
  seed: string;
  /** 生成封面上的分类标记，已翻译。 */
  label: string;
}) {
  return (
    <Link
      href={href}
      className="home-card group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border bg-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-video overflow-hidden border-b">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1000px) 33vw, (min-width: 560px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <GeneratedCover
            title={name}
            label={label}
            seed={seed}
            className="absolute inset-0"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {/* 名称与描述来自数据库，是中文内容，标注 lang 供浏览器按需翻译。 */}
        <h2 lang="zh-CN" className="headline-sm text-xl transition-colors group-hover:text-primary">
          {name}
        </h2>
        {description ? (
          <p lang="zh-CN" className="mt-3 line-clamp-2 text-sm leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
        <p className="mt-auto pt-5 text-sm font-semibold tabular-nums text-primary">
          {countLabel}
        </p>
      </div>
    </Link>
  );
}
