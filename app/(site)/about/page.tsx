import type { Metadata } from "next";
import { Github, Mail, Mic2, Network, Rss, Wrench } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileCard } from "@/components/about/profile-card";
import { getPrimaryPublishedAuthor, getPublishedPosts } from "@/lib/posts/queries";

export const metadata: Metadata = {
  title: "关于",
  description: "关于边界笔记，以及这里持续记录的实时语音、系统架构与工程实践。",
};

const focusAreas = [
  {
    href: "/categories/speech-recognition",
    title: "实时语音系统",
    description: "AEC、降噪、VAD、流式 ASR、打断与响应撤销——把实时链路在真实约束下跑通。",
    icon: Mic2,
  },
  {
    href: "/tags/系统架构",
    title: "系统架构",
    description: "会话状态机、事件管线、边界与责任划分。先说清数据去了哪里，再谈扩展。",
    icon: Network,
  },
  {
    href: "/categories/inference-optimization",
    title: "工程实践",
    description: "渲染管线、推理优化、安全边界与可观测性，以及那些落地时才会咬人的细节。",
    icon: Wrench,
  },
];

const currentWork = [
  {
    title: "Barge-in 实时语音服务",
    description: "一套纯 CPU 的数字人实时语音打断系统，围绕同一个会话状态机协调声学链路、时间边界与业务撤销。",
  },
  {
    title: "这个博客平台本身",
    description: "自建的 Next.js 博客：Markdown 服务端渲染、Mermaid 内联 SVG、版本 diff 与媒体库，也是一个持续演进的工程样本。",
  },
];

export default function AboutPage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL?.trim();

  return (
    <div className="shell pb-16 sm:pb-24">
      <section className="grid items-start gap-10 pt-12 min-[940px]:grid-cols-[minmax(0,1fr)_20rem] min-[940px]:gap-16 sm:pt-16">
        <div className="min-w-0 max-w-[40em]">
          <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
            关于
          </p>
          <h1 className="headline mt-5 text-[clamp(2.4rem,5vw,3.6rem)]">
            在复杂系统中，
            <br />
            寻找清晰的
            <span className="[background:linear-gradient(transparent_62%,color-mix(in_oklch,var(--warm)_45%,transparent)_62%)]">
              边界
            </span>
            。
          </h1>
          <p className="mt-6 text-lg leading-[1.8] text-muted-foreground">
            我是 yty。这里记录我在实时语音系统、软件架构与工程实践上的思考——更关心一个决定为什么成立，而不只是罗列工具和结论。
          </p>
          <div className="article-body mt-8 space-y-4">
            <p>
              大多数技术文章告诉你“怎么做”，却很少说清“为什么是这条边界、它保护了什么、未来什么条件下该重新审视”。
              <strong>边界笔记想补上后半句。</strong>
            </p>
            <p>
              我做的东西大多贴近硬约束：纯 CPU 上的实时语音、可观测的事件管线，以及在延迟和误触发之间靠策略而非“万能阈值”取得平衡。把这些取舍写下来，是为了不忘记当初为什么那样选。
            </p>
          </div>
        </div>

        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileData email={email} githubUrl={githubUrl} />
        </Suspense>
      </section>

      <AboutSection title="在写什么" note="三个主要方向">
        <div className="grid gap-5 min-[720px]:grid-cols-3">
          {focusAreas.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={title}
              href={href}
              className="home-card group rounded-[var(--radius-card)] border bg-card p-6 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="grid size-10 place-items-center rounded-[0.625rem] bg-accent text-primary">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="headline-sm mt-4 text-lg group-hover:text-primary">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </AboutSection>

      <AboutSection title="手头在做" note="Now">
        <div className="grid gap-4 min-[720px]:grid-cols-2">
          {currentWork.map((item) => (
            <div
              key={item.title}
              className="grid grid-cols-[auto_1fr] items-start gap-4 rounded-[var(--radius-card)] border bg-card px-6 py-5"
            >
              <span
                aria-hidden
                className="mt-2 size-3 rounded-full bg-warm [box-shadow:0_0_0_4px_color-mix(in_oklch,var(--warm)_22%,transparent)]"
              />
              <div>
                <h3 className="font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </AboutSection>

      <AboutSection title="代表文章" note="从这几篇读起">
        <Suspense fallback={<PicksSkeleton />}>
          <FeaturedPostList />
        </Suspense>
      </AboutSection>

      <AboutSection title="联系" note="随时">
        <div className="flex flex-wrap gap-3">
          {email ? (
            <ContactLink href={`mailto:${email}`} icon={Mail} label="邮箱" />
          ) : null}
          {githubUrl ? (
            <ContactLink href={githubUrl} icon={Github} label="GitHub" external />
          ) : null}
          <ContactLink href="/feed.xml" icon={Rss} label="RSS 订阅" />
        </div>
      </AboutSection>
    </div>
  );
}

async function ProfileData({
  email,
  githubUrl,
}: {
  email?: string;
  githubUrl?: string;
}) {
  await connection();
  const profile = await getPrimaryPublishedAuthor();
  return (
    <ProfileCard
      name="yty"
      image={profile?.image}
      postCount={profile?.postCount ?? 0}
      email={email}
      githubUrl={githubUrl}
    />
  );
}

async function FeaturedPostList() {
  await connection();
  const posts = await getPublishedPosts(4);
  if (!posts.length) {
    return <p className="text-muted-foreground">文章正在整理中。</p>;
  }

  return (
    <div>
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/posts/${post.slug}`}
          className="group grid gap-2 border-b border-hairline py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
        >
          <span className="text-base font-semibold group-hover:text-primary sm:text-lg">
            {post.title}
          </span>
          <span className="text-xs font-semibold text-primary">
            {post.categoryName ?? "文章"}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-label="正在加载作者资料" className="overflow-hidden rounded-[var(--radius-card)] border bg-card">
      <div className="h-24 animate-pulse bg-muted" />
      <div className="space-y-4 px-5 pb-5 pt-10">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function PicksSkeleton() {
  return (
    <div aria-label="正在加载代表文章" className="space-y-1">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex justify-between border-b border-hairline py-4">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function AboutSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      <div className="rule-anchor flex items-baseline gap-3 pt-4">
        <h2 className="headline-sm text-xl">{title}</h2>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ContactLink({
  href,
  icon: Icon,
  label,
  external = false,
}: {
  href: string;
  icon: typeof Mail;
  label: string;
  external?: boolean;
}) {
  const className =
    "inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const content = (
    <>
      <Icon aria-hidden className="size-4" />
      {label}
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
