# Codex Spec:顶栏感知登录态(登录按钮 / 头像下拉)

## 目标
顶栏目前是静态组件,把「账户」写死成导航里一个普通文字链接(`components/site-header.tsx:12`),不区分登录态、也没有退出入口。改为**感知登录态**:未登录显示「登录」按钮(最右),已登录显示头像下拉(最右,含账户中心 / 返回后台 / 退出登录)。方向由 mock 敲定,参考 `docs/design/header-auth-mock.html`。

## 硬约束
- 暗色走 `.dark`(next-themes),不要 `prefers-color-scheme`;复用现有 token 与 `.shell`(勿改)。
- **不牺牲内容页缓存**:采用**客户端方案**读登录态(见 §1),不得在根 layout / 顶栏里调用 `auth()`(那会读 cookie、把每个页面推成请求时动态,废掉首页/文章页的 `"use cache"` 缓存)。
- **退出登录必须是 POST**(不是 GET 链接):用 `next-auth/react` 的 `signOut({ redirectTo: "/" })`(内部走 CSRF 保护的 POST),或 server action 表单;二选一,别做成普通 `<a href>`。
- 现有登录/登出的业务行为不变(登录后按角色重定向仍在各自页面处理;本 spec 只加顶栏 UI)。

## 结构与实现

### 1. Session 供给(客户端)
- 根 layout(`app/layout.tsx`)在 `ThemeProvider` 内包一层 `SessionProvider`(来自 `next-auth/react`;因它是客户端组件,建议新建 `components/session-provider.tsx`(`"use client"`)做薄封装再引入,children 以 props 透传、保持服务端渲染)。
- **不要**给 `SessionProvider` 传服务端 `auth()` 取到的 session(那又会读 cookie 导致 layout 动态)。接受首帧 `status: "loading"`,用占位挡闪烁(见 §2)。代价是每次访问会有一次 `/api/auth/session` 客户端请求,可接受。

### 2. `<UserMenu>`(新客户端组件 `components/auth/user-menu.tsx`)
放在顶栏右侧、`ThemeToggle` **之后(最右)**。用 `useSession()`,三态:
- **loading**:渲染一个头像尺寸的中性占位(固定宽度,避免登录↔头像切换时的布局跳动)。不要在此态先显示「登录」再跳成头像。
- **未登录(unauthenticated)**:一个「登录」按钮 → `/login`。实心主色胶囊(`bg-primary text-primary-foreground` 圆角),就是 mock 那版。
- **已登录(authenticated)**:头像按钮(头像 + 昵称 + 下拉箭头)→ 点开下拉菜单:
  - 头部:昵称 + 邮箱 + **角色 chip**(用 `--accent`,文案复用 `account/page.tsx` 的 `roleLabels`,建议抽成共享常量避免重复)。
  - 菜单项:
    1. 账户中心 → `/account`
    2. 返回后台 → `/admin`,**仅当 `session.user.role !== "reader"` 时渲染**
    3. 分隔线
    4. 退出登录 →(见硬约束,POST;`signOut({ redirectTo: "/" })`),红色(`--danger`)呈现。
  - 头像:有 `session.user.image` 用之,否则昵称首字母 + `conic-gradient(from 200deg, var(--primary), var(--warm))` 圆底(与文章页 byline / 账户页一致)。**若当前 session 未暴露 `image`,允许退化为首字母兜底**;如需真头像可在 session/jwt 回调补 `image`——在交付说明里注明选了哪种。

### 3. 下拉交互与可达性
- 受控开合:点头像切换;**Esc 关闭**、**点击菜单外部关闭**、失焦关闭;关闭后焦点回到头像按钮。
- ARIA:头像按钮 `aria-haspopup="menu"` + `aria-expanded`;菜单 `role="menu"`,项 `role="menuitem"`;键盘可 Tab 进出(方向键导航可选)。
- `prefers-reduced-motion` 关过渡;focus 可见(沿用 `focus-visible:ring`)。

### 4. 导航清理
- `components/site-header.tsx` 的 `navigation` 数组**删除「账户」项**(登录态入口统一由右侧 `UserMenu` 承担);其余 文章/分类/标签/系列/关于 不变。

## 范围外(本次不做,但记一笔)
- 现有主导航是 `hidden lg:flex`——**移动端根本不显示导航菜单**(仅 brand + 搜索图标 + 主题)。这是既有缺口,不在本 spec;`UserMenu`(登录按钮/头像)在移动端仍需正常显示在最右。若要补移动端汉堡菜单,另开 spec。

## 通用要求
- 亮/暗双主题;body 不横向溢出;顶栏 `sticky` 行为不变。
- 未登录态与已登录态右侧宽度尽量稳定,减少水合后跳动。

## 验收标准
- [ ] 未登录:顶栏最右为「登录」按钮 → `/login`;导航无「账户」。
- [ ] 已登录:顶栏最右为头像按钮,展开含 账户中心 /(员工)返回后台 / 退出登录;头部显示昵称+邮箱+角色。
- [ ] 退出登录是 POST(非 GET 链接),登出后跳首页。
- [ ] loading 态有占位,不出现「登录→头像」闪跳;右侧无明显布局跳动。
- [ ] 「返回后台」仅 `role !== "reader"` 可见;头像有图用图、无图首字母兜底。
- [ ] 下拉可 Esc / 点外部关闭,键盘可达,focus 可见;亮/暗正常。
- [ ] 未在 layout/顶栏调用 `auth()`;首页/文章页仍保持原有缓存(渲染模式未从静态退化为强制动态)。
- [ ] `tsc --noEmit`、ESLint、build、`node --test` 全绿。

## 交付说明
- 新增/改动文件;`SessionProvider` 封装位置;`UserMenu` 的三态实现。
- 头像用了 session 的 `image` 还是首字母兜底(以及是否动了 session/jwt 回调)。
- 退出登录用 `next-auth/react` `signOut` 还是 server action 表单。
- 确认内容页渲染模式未退化(如何验证的,例如 `next build` 输出里首页/文章路由的标记)。
