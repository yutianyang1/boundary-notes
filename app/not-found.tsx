import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell flex flex-1 items-center py-24">
      <div>
        <div className="flex items-center gap-3">
          <span aria-hidden className="block h-1 w-8 bg-primary" />
          <span className="eyebrow tabular-nums text-foreground/80">404</span>
        </div>

        <h1 className="headline mt-6 text-[2.25rem] sm:text-5xl">这里暂时没有内容</h1>

        <p className="mt-8 max-w-[32em] text-lg leading-[1.8] text-muted-foreground">
          链接可能已变更，或者文章尚未发布。
        </p>

        <Link
          href="/"
          className="mt-8 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
