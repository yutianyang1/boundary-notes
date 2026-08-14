import Image from "next/image";
import { createTranslator } from "next-intl";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { localizedSponsor, readActiveSponsorSlot } from "@/lib/settings/sponsor";

/**
 * sidebar 版跟随 aside,只在 ≥1040px 出现;
 * inline 版补移动端——侧栏在窄屏整个不渲染,不补的话赞助位在手机上完全看不见,
 * 而移动端往往才是流量大头。两版共用同一份缓存数据,不会重复查库。
 */
export async function SponsorSlot({
  locale,
  variant = "sidebar",
}: {
  locale: Locale;
  variant?: "sidebar" | "inline";
}) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "post" });
  const sponsor = await readActiveSponsorSlot();
  if (!sponsor) return null;
  const copy = localizedSponsor(sponsor, locale);

  const inline = variant === "inline";

  return (
    <aside
      aria-label={t("sponsored")}
      className={inline
        ? "mt-12 min-[1040px]:hidden"
        : "mt-6 shrink-0 border-t pt-5"}
    >
      <p lang={copy.lang} className="eyebrow mb-3 text-muted-foreground">{copy.label}</p>
      <a
        href={sponsor.linkUrl}
        target="_blank"
        // sponsored 是付费链接的标准标注,缺了它等于向搜索引擎传递未声明的权重。
        rel="sponsored noopener noreferrer"
        className={`block overflow-hidden rounded-[var(--radius-card)] border bg-card transition-[border-color,box-shadow] hover:border-primary/40 hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          inline ? "min-[560px]:flex min-[560px]:items-stretch" : ""
        }`}
      >
        {sponsor.imageUrl ? (
          <div
            className={`relative aspect-[16/10] w-full ${
              inline ? "min-[560px]:aspect-auto min-[560px]:w-56 min-[560px]:shrink-0" : ""
            }`}
          >
            {/* unoptimized 与封面、头像保持一致:媒体库图片不走 next/image 优化管线。 */}
            <Image
              src={sponsor.imageUrl}
              alt=""
              fill
              unoptimized
              sizes={inline ? "(min-width: 560px) 224px, 100vw" : "(min-width: 1440px) 384px, 304px"}
              className="object-cover"
            />
          </div>
        ) : null}
        <div className={inline ? "p-4 min-[560px]:flex-1" : "p-3.5"}>
          <p lang={copy.lang} className="font-bold leading-snug">{copy.title}</p>
          {copy.description ? (
            <p className="mt-1.5 text-[0.8125rem] leading-6 text-muted-foreground">
              {copy.description}
            </p>
          ) : null}
          <p className="mt-2.5 text-[0.8125rem] font-semibold text-primary">
            {copy.ctaText} →
          </p>
        </div>
      </a>
    </aside>
  );
}
