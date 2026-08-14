import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { loadOgFonts } from "@/lib/og/fonts";
import { getPublishedPost } from "@/lib/posts/queries";

export const alt = "Social sharing card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ImageProps = { params: Promise<{ slug: string }> };

function titleFontSize(title: string) {
  const length = Array.from(title).length;
  if (length > 46) return 50;
  if (length > 32) return 58;
  return 68;
}

export default async function PostOpenGraphImage({ params }: ImageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "边界笔记";
  // OG 图是给外部抓取器看的，分类名来自数据库(中文)，兜底用中性词。
  const category = post.categoryName ?? "Article";
  const displayTitle = Array.from(post.title).slice(0, 72).join("");
  const { fonts, family } = await loadOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#111827",
          color: "#f8fafc",
          fontFamily: family,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            opacity: 0.32,
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.13) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -190,
            right: -110,
            display: "flex",
            width: 560,
            height: 560,
            border: "110px solid rgba(99,102,241,0.18)",
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 88,
            bottom: -215,
            display: "flex",
            width: 430,
            height: 430,
            border: "2px solid rgba(129,140,248,0.32)",
            borderRadius: 999,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "68px 76px 64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                width: 42,
                height: 5,
                borderRadius: 99,
                background: "#818cf8",
              }}
            />
            <div
              style={{
                display: "flex",
                color: "#c7d2fe",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {category}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              maxWidth: 980,
              maxHeight: 330,
              overflow: "hidden",
              color: "#f8fafc",
              fontSize: titleFontSize(displayTitle),
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: 0,
            }}
          >
            {displayTitle}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(148,163,184,0.32)",
              paddingTop: 24,
              color: "#94a3b8",
              fontSize: 22,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  width: 4,
                  height: 25,
                  borderRadius: 99,
                  background: "#818cf8",
                }}
              />
              <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{siteName}</span>
            </div>
            <span>{post.authorName}</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
