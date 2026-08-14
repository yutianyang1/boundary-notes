import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales, routing } from "@/i18n/routing";
import { resolveTagRedirect } from "@/lib/posts/slug-redirects";

const handleI18nRouting = createMiddleware(routing);

const localePattern = new RegExp(`^/(${locales.join("|")})(?=/|$)`);

/** 去掉 locale 前缀，用于按逻辑路径做判断。 */
function stripLocale(pathname: string) {
  const withoutLocale = pathname.replace(localePattern, "");
  return withoutLocale === "" ? "/" : withoutLocale;
}

function localeOf(pathname: string) {
  return localePattern.exec(pathname)?.[1] ?? defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 标签 slug 从中文迁到英文后，旧地址 301 到新地址。
  // 放在 i18n 处理之前：旧地址已被收录，任何情况下都不应落到 404。
  const redirectTarget = resolveTagRedirect(pathname);
  if (redirectTarget) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTarget;
    return NextResponse.redirect(url, 301);
  }

  // 后台不参与 i18n：保持原有的 x-current-path 行为，供守卫构造 callbackUrl。
  if (pathname.startsWith("/admin")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-current-path", `${pathname}${search}`);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 注册开关关闭时，注册与验证邮箱一律 404。逻辑路径判断，
  // 这样 /register 和 /en/register 都能挡住。
  const logicalPath = stripLocale(pathname);
  const registrationEnabled = process.env.PUBLIC_REGISTRATION_ENABLED?.toLowerCase() === "true";
  if (!registrationEnabled && (
    logicalPath.startsWith("/register") ||
    logicalPath === "/verify-email"
  )) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const response = handleI18nRouting(request);
  response.headers.set("x-current-path", `${pathname}${search}`);
  response.headers.set("x-locale", localeOf(pathname));
  return response;
}

export const config = {
  // 覆盖所有公开路由与后台；排除 API、内部任务、媒体、构建产物，
  // 以及带扩展名的文件（feed.xml、sitemap.xml、robots.txt、icon.svg 等）。
  matcher: ["/((?!api|internal|media|_next|_vercel|.*\\..*).*)"],
};
