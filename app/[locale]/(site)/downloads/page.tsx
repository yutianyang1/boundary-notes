import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDownToLine, BookOpen, Check, KeyRound, MessageCircle, Smartphone } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import type { Locale } from "@/i18n/routing";
import { androidRelease as release } from "@/lib/mobile/release";

const copy = {
  zh: {
    title: "下载 App", description: "下载边界笔记 Android 原生 App，随时阅读文章、与好友聊天。",
    eyebrow: "边界笔记 · ANDROID", heading: "把边界笔记，", accent: "装进口袋。",
    intro: "为手机而做的原生阅读与聊天体验。你的文章、好友与博客账号，在这里继续相连。",
    download: "下载 Android APK", minimum: "Android 8.0 及以上", debug: "首版 · 调试版",
    name: "边界笔记", native: "Android 原生应用", released: "发布于", included: "手机上的边界笔记",
    features: [
      { title: "专注阅读", body: "原生文章列表、搜索与 Markdown 阅读，让内容回到眼前。" },
      { title: "好友常联系", body: "查找好友、收发私信、查看站内未读消息，与网页端保持同步。" },
      { title: "一个账号", body: "使用已有邮箱账号登录，支持验证器与恢复码二次验证。" },
    ],
    stepsTitle: "三步，开始使用", steps: [
      { title: "下载安装包", body: "在 Android 手机上打开本页，点击上方下载按钮。" },
      { title: "完成安装", body: "打开下载的 APK 文件，按手机的系统提示完成安装。" },
      { title: "登录博客账号", body: "输入已有邮箱和密码；已绑定验证器的账号继续完成二次验证。" },
    ],
    note: "首版暂未接入 GitHub 登录、后台系统推送和离线文章下载。消息页在前台刷新站内未读消息。",
    details: "安装包信息与完整性校验", checksum: "下载 SHA-256 校验文件", version: "版本", size: "安装包", platform: "适用系统",
  },
  en: {
    title: "Download App", description: "Download the native Boundary Notes Android app to read posts and chat with friends.",
    eyebrow: "BOUNDARY NOTES · ANDROID", heading: "Your notes,", accent: "in your pocket.",
    intro: "Native reading and conversations, made for your phone. Stay connected to your posts, friends, and existing blog account.",
    download: "Download Android APK", minimum: "Android 8.0 or later", debug: "First release · Debug build",
    name: "Boundary Notes", native: "Native Android app", released: "Released", included: "Boundary Notes, on your phone",
    features: [
      { title: "Room to read", body: "Native post browsing, search, and Markdown reading that keeps the focus on the content." },
      { title: "Keep in touch", body: "Find friends, exchange private messages, and see unread messages synced with the website." },
      { title: "One account", body: "Sign in with your existing email account, including authenticator and recovery-code verification." },
    ],
    stepsTitle: "Get started in three steps", steps: [
      { title: "Download the APK", body: "Open this page on your Android phone and use the download button above." },
      { title: "Install the app", body: "Open the downloaded APK and follow your phone’s installation prompts." },
      { title: "Sign in", body: "Use your existing email and password, then complete two-factor verification if enabled." },
    ],
    note: "This first release does not include GitHub sign-in, background push notifications, or offline article downloads. Unread messages refresh while the app is in the foreground.",
    details: "Package details and integrity", checksum: "Download SHA-256 checksum", version: "Version", size: "Package", platform: "System",
  },
} as const;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const c = copy[locale as Locale];
  return { title: c.title, description: c.description, alternates: localeAlternates("/downloads", locale as Locale) };
}

export default async function DownloadsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = copy[locale as Locale];
  const icons = [BookOpen, MessageCircle, KeyRound];
  return (
    <div className="shell pb-16 sm:pb-24">
      <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <p className="eyebrow text-primary">{c.eyebrow}</p>
          <h1 className="headline mt-5 text-[clamp(2.6rem,5vw,4.6rem)] leading-[1.15]">{c.heading}<br /><span className="text-primary">{c.accent}</span></h1>
          <p className="mt-6 max-w-[35rem] text-lg leading-8 text-muted-foreground">{c.intro}</p>
          <a href={release.apk} download className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <ArrowDownToLine aria-hidden className="size-5" />{c.download}
          </a>
          <p className="mt-4 text-sm text-muted-foreground">v{release.version}<span className="mx-2">·</span>{release.size}<span className="mx-2">·</span>{c.minimum}</p>
        </div>
        <div className="relative min-w-0 rounded-[2rem] border bg-card p-7 [box-shadow:var(--shadow)] sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary"><Smartphone aria-hidden className="size-4" />{c.debug}</span>
          <div className="mt-8 flex items-center gap-5">
            <Image src="/brand/logo-96.png" width={72} height={72} alt="" className="size-[72px] shrink-0 rounded-2xl" />
            <div className="min-w-0"><h2 className="text-2xl font-bold">{c.name}</h2><p className="mt-2 text-sm text-muted-foreground">{c.native}</p></div>
          </div>
          <ul className="mt-8 space-y-4 border-t pt-6">{c.features.map(feature => <li key={feature.title} className="flex items-center gap-3"><Check aria-hidden className="size-4 shrink-0 text-primary" /><span>{feature.title}</span></li>)}</ul>
          <p className="mt-7 text-xs text-muted-foreground">{c.released} {release.date}</p>
        </div>
      </section>
      <section aria-label={c.included} className="grid gap-4 md:grid-cols-3">{c.features.map((feature, index) => {
        const Icon = icons[index];
        return <div key={feature.title} className="rounded-2xl border bg-card p-6"><Icon aria-hidden className="size-6 text-primary" /><h2 className="mt-5 text-lg font-semibold">{feature.title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.body}</p></div>;
      })}</section>
      <section className="mt-14 rounded-2xl border bg-muted/30 p-6 sm:p-8">
        <h2 className="text-xl font-bold">{c.stepsTitle}</h2>
        <ol className="mt-7 grid gap-7 md:grid-cols-3">{c.steps.map((step, index) => <li key={step.title}><span className="font-mono text-sm font-semibold text-primary">0{index + 1}</span><h3 className="mt-3 font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{step.body}</p></li>)}</ol>
      </section>
      <p className="mt-7 max-w-4xl text-sm leading-7 text-muted-foreground">{c.note}</p>
      <details className="mt-8 rounded-2xl border bg-card p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{c.details}</summary>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">{[[c.version, `v${release.version}`], [c.size, release.size], [c.platform, c.minimum]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
        <p className="mt-6 text-xs font-semibold text-muted-foreground">SHA-256</p><code className="mt-2 block break-all text-xs leading-6">{release.sha256}</code>
        <a href={release.checksumFile} className="mt-4 inline-block text-sm text-primary underline underline-offset-4">{c.checksum}</a>
      </details>
    </div>
  );
}
