export function PageHeader({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  count?: number;
}) {
  return (
    <header className="max-w-[52rem]">
      <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
        {eyebrow}
      </p>
      <h1 className="headline mt-5 text-[2.5rem] sm:text-5xl">{title}</h1>
      {description ? (
        <p className="mt-5 max-w-[42em] leading-[1.8] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {typeof count === "number" ? (
        <p className="mt-5 w-fit rounded-full bg-accent px-3 py-1.5 text-sm font-semibold tabular-nums text-primary">
          共 {count} 篇
        </p>
      ) : null}
    </header>
  );
}
