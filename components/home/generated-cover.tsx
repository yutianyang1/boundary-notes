function seedVariant(seed: string) {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return [
    "",
    "generated-cover-v2",
    "generated-cover-v3",
    "generated-cover-v4",
    "generated-cover-v5",
  ][hash % 5];
}

export function GeneratedCover({
  title,
  label,
  seed,
  className = "",
  patternOnly = false,
}: {
  title: string;
  label?: string | null;
  seed: string;
  className?: string;
  patternOnly?: boolean;
}) {
  return (
    <div
      role={patternOnly ? undefined : "img"}
      aria-hidden={patternOnly || undefined}
      aria-label={patternOnly ? undefined : `${title}的程序化封面`}
      className={`generated-cover ${seedVariant(seed)} ${className}`}
    >
      {patternOnly ? null : (
        <div className="absolute inset-x-[7%] bottom-[9%] max-w-[78%]">
          {label ? (
            <span className="mb-2 block text-[0.65rem] font-semibold tracking-[0.14em] text-indigo-200/75 sm:text-xs">
              {label}
            </span>
          ) : null}
          <span className="line-clamp-2 block text-base font-extrabold leading-tight text-balance sm:text-xl">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
