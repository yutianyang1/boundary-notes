import Image from "next/image";
import Link from "next/link";
import { GeneratedCover } from "@/components/home/generated-cover";

export function TermCard({
  href,
  name,
  description,
  count,
  cover,
  seed,
  label,
}: {
  href: string;
  name: string;
  description?: string | null;
  count: number;
  cover?: string | null;
  seed: string;
  label: "分类" | "系列";
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
        <h2 className="headline-sm text-xl transition-colors group-hover:text-primary">
          {name}
        </h2>
        {description ? (
          <p className="mt-3 line-clamp-2 text-sm leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
        <p className="mt-auto pt-5 text-sm font-semibold tabular-nums text-primary">
          {count} 篇
        </p>
      </div>
    </Link>
  );
}
