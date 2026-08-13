# Codex Spec:认证页沉浸式布局(用 Route Group 下沉头尾)

## 问题
登录/注册/验证邮箱是整屏 split 版式(`components/auth/auth-split.tsx`),但它们和所有页面一样套在根 `app/layout.tsx` 的 `SiteHeader` + `SiteFooter` 里,于是整屏认证画面顶上压着公共导航栏、底下拖着页脚,很丑。

App Router 里子页面无法"摘掉"祖先布局的 chrome,所以**必须把头尾从根 layout 下沉**:引入 Route Group,认证页归到一个不带头尾的组。Route Group `(name)` 只分组、**不改 URL**,`/login` `/posts` 等路径全部不变。

## 目标结构

```
app/
  layout.tsx            # 只剩 html/body + ThemeProvider + SessionProvider + {children}（全局 metadata/viewport 保留）
  globals.css           # 不动
  not-found.tsx         # 不动（全局 404）
  robots.txt/ sitemap.xml/ feed.xml/ api/ internal/ media/   # 路由/handler，无 chrome，不动
  admin/                # 留在根（裸 layout）→ 只有自己的 AdminShell，无公共头尾；见“admin 归属”
  (site)/
    layout.tsx          # 新增：flex 列容器 + SiteHeader + <main> + SiteFooter（即现在根 layout 里那段 chrome）
    page.tsx            # 首页（从 app/page.tsx 移入）
    about/ account/ categories/ posts/ search/ series/ tags/   # 移入
  (auth)/
    login/ register/ verify-email/   # 移入，无头尾
```

### 根 `app/layout.tsx` 改造
- 移除 `SiteHeader`/`SiteFooter` import 与那段 `<div className="flex min-h-screen flex-col"><SiteHeader/><main…>{children}</main><SiteFooter/></div>`。
- body 内直接 `<ThemeProvider …><SessionProvider>{children}</SessionProvider></ThemeProvider>`。
- `metadata`、`viewport`、字体 import、`<html>` 属性(`lang`/`suppressHydrationWarning`/`data-scroll-behavior`)全部**保留在根**。

### 新增 `app/(site)/layout.tsx`
把原来根 layout 的 chrome 原样搬来:
```tsx
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </div>
  );
}
```

### `(auth)` 组
- **不需要自己的 layout.tsx**——它继承根(现在的根已无 chrome),认证页直接铺满 body,正合适。`AuthSplit` 自带整屏栅格。
- 如果 Codex 更想显式化,可加一个极简 `app/(auth)/layout.tsx` 只 `return children`,但不是必须。

### AuthSplit 高度修正(重要)
`components/auth/auth-split.tsx` 有两处 `min-h-[calc(100svh-4rem)]`(组件 L19、骨架 L62),那个 `-4rem` 是当初给 `h-16` 顶栏让位的。头尾去掉后改成整屏:
- 两处 `min-h-[calc(100svh-4rem)]` → `min-h-svh`(或 `min-h-[100svh]`)。

## admin 归属(已定:脱掉公共头尾)
admin 现在套着公共 `SiteHeader`,和它自己的 `AdminShell` 那排按钮**叠成双层导航,丑**。**决定:`admin/` 留在(或移回)根级 `app/admin/`,不进 `(site)`。** 根 layout 已是裸的(只有 Provider),所以 admin 只会渲染自己的 `AdminShell`,没有公共营销头尾。
- 后台自给自足,不会成死胡同:`AdminShell` 顶栏已含 **`访问站点`(→ `/`)** 链接回前台,右上角已有 **`退出`** 按钮。
- 注意:若此前重构已把 admin 放进 `app/(site)/admin/`,需**移回 `app/admin/`**。URL 仍是 `/admin/*`,不变。

## 硬约束
- **URL 一律不变**(Route Group 不进路径)。移动后逐一核对:`/`、`/login`、`/register`、`/verify-email`、`/about`、`/account`、`/posts`、`/posts/[slug]`、`/categories`…全部可达且路径不变。
- 组件引用基本走 `@/` 别名,移动目录不该断;若有个别相对路径 import,跟着修正。
- 暗色仍走 `.dark`;`.shell`(100rem)不动;认证页登录/注册/验证的既有业务守卫(`notFound()`、redirect、token 校验、注册开关 `isPublicRegistrationEnabled()`)全部保留。
- 只挪位置 + 拆 layout,不改任何页面逻辑与文案。

## 验收标准
- [ ] `/login` `/register` `/verify-email` **不再渲染** SiteHeader / SiteFooter,整屏 split 铺满视口(桌面左右分栏、移动端单列)。
- [ ] AuthSplit 高度改为 `min-h-svh`,底部无因 `-4rem` 造成的空隙或滚动条。
- [ ] 前台页面(首页/文章/分类/标签/系列/关于/账户)头尾正常,外观与改造前一致。
- [ ] `/admin/*` **不再渲染公共 SiteHeader/SiteFooter**,只剩自身 AdminShell(顶栏含 `访问站点` 与 `退出`);URL 仍为 `/admin/*`。
- [ ] 所有路由 URL 不变,404 与 metadata 正常。
- [ ] 内容页渲染模式未退化(首页/文章仍 `◐` PPR,不因重构变 `ƒ` 全动态)。
- [ ] `tsc --noEmit`、ESLint、`next build`、`node --test` 全绿。

## 交付说明
- 列出移动了哪些目录、新增 `(site)/layout.tsx`、根 layout 的删改。
- admin 放哪(默认 `(site)`)。
- 确认 `next build` 输出里各路由路径未变、内容页仍 PPR。
