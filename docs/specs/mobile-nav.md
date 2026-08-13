# Codex Spec:移动端主导航(汉堡 + 抽屉)

## 问题
主导航是 `hidden ... lg:flex`(`components/site-header.tsx:21`),屏宽 **<1024px 整条消失,且无任何兜底**。手机/竖屏平板上顶栏只剩 品牌 + 搜索 + 主题 + 头像,**没有入口去 文章/分类/标签/系列/关于**。补一个移动端汉堡菜单,点开抽屉列出这些导航项。

## 范围(收紧,别扩)
- **只补导航链接的移动端入口。**
- **不碰搜索**:现有 `hidden sm:block` 搜索表单 + `sm:hidden` 搜索图标保持原样。
- **不碰登录态**:`UserMenu`(头像/登录按钮)在移动端已经渲染在右侧,抽屉里**不重复**账户/登出入口。
- 桌面(`lg` 及以上)导航完全不变。

## 结构

### 1. 抽离共享导航数据
`navigation` 数组现在内联在 `site-header.tsx`。抽到一个纯数据模块(如 `lib/navigation.ts`),让服务端的 `SiteHeader` 桌面导航和客户端的 `MobileNav` 都 import 同一份,避免两处维护:
```ts
export const navigation = [
  { href: "/posts", label: "文章" },
  { href: "/categories", label: "分类" },
  { href: "/tags", label: "标签" },
  { href: "/series", label: "系列" },
  { href: "/about", label: "关于" },
] as const;
```

### 2. 新增客户端组件 `components/mobile-nav.tsx`(`"use client"`)
包含**汉堡按钮 + 抽屉**两部分。`SiteHeader` 保持服务端组件,只 import 并渲染 `<MobileNav />`。

**汉堡按钮:**
- 位置:放在左侧组最前、`BrandMark` **之前**,`className` 含 `lg:hidden`(和桌面导航的 `hidden lg:flex` 断点对齐,单一 1024px 分界)。即移动端顺序为 `[☰] [品牌] … [搜索][主题][头像]`。
- 图标:`Menu`(打开)/ `X`(关闭),lucide,尺寸与右侧控件一致(`size-9` 命中区)。
- ARIA:`aria-label` 打开时"打开菜单"、展开时"关闭菜单";`aria-expanded`;`aria-controls` 指向抽屉 id。

**抽屉(左侧滑入 + 遮罩):**
- 遮罩 scrim 铺满视口(`fixed inset-0`,`bg-black/40 backdrop-blur-sm`,`z` 高于 header 的 `z-40`,建议 `z-50`),点击关闭。
- 面板从左滑入(`translate-x` 过渡),宽度约 `min(80vw, 20rem)`,`bg-background`/`bg-card` + 右侧 `border` + `[box-shadow:var(--shadow)]`,内部纵向列出 5 个导航链接。
- 链接样式复用桌面观感:`text-muted-foreground hover:text-foreground`,命中区足够大(每项 `py-3` 量级);**当前区块高亮可选**(用 `usePathname()` 判断 `pathname.startsWith(href)`,`aria-current="page"` + 主色)。
- 面板顶部可放品牌/标题一行 + 关闭按钮(`X`);底部留白即可,**不放搜索、不放账户/登出**。

### 3. 交互与可达性(务必齐全)
- 受控开合:点汉堡开、点 scrim 关、点任意导航项后**自动关**(导航过渡前 `setOpen(false)`)。
- **Esc 关闭**;关闭后焦点**回到汉堡按钮**。
- 打开时**焦点移入抽屉**(首个可聚焦项或关闭按钮),抽屉内 **focus trap**(Tab 不逸出到背景)。
- 打开时**锁 body 滚动**(`overflow: hidden`),关闭时恢复。
- `role="dialog"` `aria-modal="true"` `aria-label="主导航"`。
- `prefers-reduced-motion`:关滑入过渡(`motion-reduce:transition-none`),直接显隐。
- `focus-visible:ring` 沿用现有风格。

## 硬约束
- 暗色走 `.dark`(next-themes),不用 `prefers-color-scheme`;颜色一律走既有 token;`.shell`(100rem)不动。
- header `sticky top-0` 行为不变;抽屉/遮罩层级高于 header。
- body 不横向溢出;抽屉宽度用相对单位。
- 不改任何页面逻辑与既有搜索/登录态。

## 验收标准
- [ ] <1024px:顶栏出现汉堡按钮,点开抽屉含 文章/分类/标签/系列/关于 五项,点击可正确跳转。
- [ ] ≥1024px:汉堡与抽屉不出现(`lg:hidden`),桌面导航与今天完全一致。
- [ ] 点导航项 / 点遮罩 / 按 Esc 均能关闭;关闭后焦点回到汉堡按钮。
- [ ] 抽屉打开时焦点在抽屉内且 Tab 不逸出;body 滚动被锁,关闭后恢复。
- [ ] 桌面导航与移动导航共用同一份 `navigation` 数据(无重复维护)。
- [ ] 亮/暗双主题正常;`prefers-reduced-motion` 下无滑动动画;`focus-visible` 可见。
- [ ] 搜索、`UserMenu`(头像/登录)行为与位置未受影响。
- [ ] 内容页渲染模式未退化(首页/文章仍 `◐` PPR);`tsc --noEmit`、ESLint、`next build`、`node --test` 全绿。

## 交付说明
- 新增/改动文件;`navigation` 抽到哪。
- 抽屉的开合/焦点管理/滚动锁实现方式。
- 确认桌面端零变化、内容页仍 PPR。

## 备注(范围外)
- 移动端搜索现状(<sm 图标、≥sm 表单)本次不动;若日后想把搜索也并进抽屉,另议。
