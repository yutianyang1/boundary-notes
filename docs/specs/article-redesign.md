# Codex Spec:文章详情页视觉改版

## 目标
把 `app/posts/[slug]/page.tsx` 的阅读体验按首页新风格拉齐:程序化封面横幅、作者信息上移到标题下、右侧 rail 精简、相关文章卡片化,让首页与内页视觉一致。方向已由 mock 敲定,参考 `docs/design/article-redesign.html`。

**这是"复用现有组件 + 重排布局 + 换皮",不是新造功能。** 页面已有的机制全部保留:`ReadingProgress`、`ArticleToc`(已含 IntersectionObserver active 高亮)、`CodeCopyButtons`、`PostViewTracker`、`ShareLinkButton`、`SeriesNavigation`、`PopularPosts`、mermaid 图版、JSON-LD、`generateMetadata`——**不要动它们的逻辑,只调用处/样式跟着变**。

## 硬约束(同首页)
- 暗色走 `.dark`(next-themes),**不要** `prefers-color-scheme`。
- 复用已落地的 token 与组件:`--warm` / `--shadow` / `--radius-card`、`GeneratedCover`(`components/home/generated-cover.tsx`,已上线)、`--color-warm`。
- `.shell` 全局 100rem 不动。
- 正文排版类(`.article-body` 下的 h2/代码块/mermaid/表格/callout)已有样式,沿用;本次只按下面几条微调。

## 改动清单

### 1. 程序化封面横幅(新增兜底)
现状:仅 `post.cover` 存在时渲染 `<Image>`,没封面就完全没有图。
改为:**没封面时用 `GeneratedCover` 兜底**,做成文章头顶部的横幅(承接首页图版语言)。
- 有 `cover`:现有 `<Image>`(aspect-video, rounded)。
- 无 `cover`:`<GeneratedCover title={post.title} label={序列或分类名} seed={post.slug} />`,包一层固定高度容器(mock `.cover`:`clamp(11rem,26vw,17rem)` + `--radius-card` + `--shadow` + border)。
- 若本文属于某系列(已有 `getSeriesNavForPost`),横幅角标 `label` 用"系列 · 《X》· 第 n / m 篇";否则用分类名。这与首页兜底封面的 `label` 参数一致。
- 位置:放在文章头(标题区)之前或之后皆可,按 mock 放标题区上方作为视觉引入。

### 2. 作者信息:从 rail 移到标题下的 byline
现状:rail 顶部有一张"作者"卡片。
改为:删掉 rail 里的作者卡,在**标题+摘要下方**加一行 byline(mock `.byline`):作者头像(有 `authorImage` 用 `<Image>`,否则首字母圆底,复用现有兜底写法)+ 作者名 + 一行 meta(`日期 · 阅读时长 · 第 N 版`,复用现有 `dateFormatter`/`readingMeta`)。
- 分类由现在的 eyebrow 链接改为 **accent chip**(和首页 `PostCard`/`FeaturedPost` 的分类 chip 一致:`rounded-full bg-accent text-primary`,链到 `/categories/<slug>`)。
- 标签行保留现状(圆角 border chip,链 `/tags/<slug>`)。

### 3. 右侧 rail 精简
现状:rail 里塞了 作者卡 + 目录 + 相关文章 + 热门 + 分享/返回顶部,偏满。
改为(mock `.rail`):**只留「目录 + 分享/返回顶部」**。
- 目录:继续用 `ArticleToc`(active 高亮已有),样式按 mock——左侧竖线,active 项靛蓝加粗 + 左边框高亮。
- 底部:`ShareLinkButton` + "↑ 返回顶部"。
- **移除** rail 里的作者卡(见 §2)、相关文章、热门列表。
- rail 收窄(mock 用 ~15rem),两栏 `min-[1040px]:grid-cols-[minmax(0,1fr)_15rem]`,给正文更多空间。sticky 定位保留。
- **热门文章**:本页不再单独展示(首页已有热门入口);如果你想保留,单独告诉我——**默认按 mock 去掉**。

### 4. 相关文章 → 底部卡片
现状:相关文章在 rail 和移动端各有一份列表。
改为:统一放**正文末尾**(系列导航卡之后),做成 **3 张 hover 卡片**(mock `.rgrid`/`.rcard`:分类 eyebrow + 标题 + 阅读时长,hover 上浮描边)。数据仍用现有 `getRelatedPosts`。移动端/桌面同一份,不再在 rail 里重复。

### 5. 换皮微调
- **阅读进度条** `ReadingProgress`:把 `bg-primary` 改为 `linear-gradient(90deg, var(--primary), var(--warm))`(mock 顶部渐变条);其余逻辑不动。
- **系列导航卡** `SeriesNavigation`:加 `--shadow` + `--radius-card`,和首页卡片统一(现有结构不动)。
- **blockquote**:mock 把正文引用的左边框从 `--primary` 改为 `--warm`(和 callout 的靛蓝区分开)。可选,按 mock 做。
- 代码块 / mermaid 图版样式已达标,不改。

## 移动端
- rail 在窄屏隐藏(现状已是);目录用现有的 `<details>` 折叠版(`ArticleToc compact`)保留。
- 封面横幅、byline、相关文章卡在窄屏单列堆叠。

## 通用要求
- 亮/暗双主题都顺(`.dark`);`prefers-reduced-motion` 下关掉进度条/卡片过渡(现有 globals 已有该 block)。
- 键盘 focus 可见;正文宽内容(代码/表格/mermaid)在自身容器内横向滚动,body 不横向溢出(现状已满足)。
- 复用 `.shell`;不新增全局宽度变量。

## 验收标准
- [ ] 没封面的文章显示程序化封面横幅;属于系列时角标显示系列信息。
- [ ] 作者信息在标题下的 byline;rail 里不再有作者卡。
- [ ] rail 只剩「目录(active 高亮)+ 分享/返回顶部」,收窄。
- [ ] 相关文章在正文末尾以 3 张 hover 卡呈现,不在 rail 重复。
- [ ] 阅读进度条为 primary→warm 渐变;TOC active、代码复制、mermaid、系列导航功能不回归。
- [ ] 暗色走 `.dark`;全局 `.shell` 未动;`PostRow`、各查询函数未受影响。
- [ ] `tsc --noEmit`、ESLint、build、测试全绿。

## 交付说明
- 改动文件清单(应集中在 `app/posts/[slug]/page.tsx` + `ReadingProgress` + `SeriesNavigation` + 少量 globals 样式)。
- 确认复用了首页的 `GeneratedCover`,未重复造兜底封面。
- 确认热门是否按默认去掉(或你保留)。
