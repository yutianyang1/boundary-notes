import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { GeneratedCover } from "@/components/home/generated-cover";

export function AuthSplit({
  panelEyebrow,
  panelTitle,
  panelDescription,
  points = [],
  children,
}: {
  panelEyebrow: string;
  panelTitle: React.ReactNode;
  panelDescription: string;
  points?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh min-[860px]:grid-cols-[1.05fr_1fr]">
      <section className="relative flex min-h-56 overflow-hidden p-6 text-white min-[860px]:min-h-[38rem] min-[860px]:p-[clamp(2rem,5vw,4rem)]">
        <GeneratedCover
          title={panelEyebrow}
          seed={`auth-${panelEyebrow}`}
          patternOnly
          className="absolute inset-0"
        />
        <div className="relative z-10 flex w-full flex-col">
          <BrandMark className="text-white focus-visible:ring-white focus-visible:ring-offset-slate-950" />
          <div className="mt-10 min-[860px]:mt-auto">
            <p className="eyebrow text-indigo-300">{panelEyebrow}</p>
            <h2 className="headline mt-3 max-w-[15ch] text-2xl text-white min-[860px]:text-[clamp(1.8rem,3.4vw,2.6rem)]">
              {panelTitle}
            </h2>
            <p className="mt-4 max-w-[32ch] text-sm leading-7 text-slate-300 min-[860px]:text-base">
              {panelDescription}
            </p>
            {points.length ? (
              <ul className="mt-6 hidden space-y-3 min-[860px]:block">
                {points.map((point) => (
                  <li key={point} className="flex items-center gap-3 text-sm text-slate-100">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-400/20 text-indigo-200">
                      <Check aria-hidden className="size-3.5" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12 sm:px-10 min-[860px]:py-16">
        <div className="w-full max-w-[25rem]">{children}</div>
      </section>
    </div>
  );
}

export function AuthSplitSkeleton() {
  return (
    <div className="grid min-h-svh min-[860px]:grid-cols-[1.05fr_1fr]">
      <div className="min-h-56 animate-pulse bg-[oklch(0.22_0.03_264)] min-[860px]:min-h-[38rem]" />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="h-[26rem] w-full max-w-[25rem] animate-pulse rounded-[var(--radius-card)] bg-muted" />
      </div>
    </div>
  );
}
