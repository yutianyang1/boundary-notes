# Codex Spec:首页 + 顶栏视觉改版

## 目标
把首页从"一句大标题 + 一列文字行"升级为有焦点、有图面的编辑部式首页:**头条大卡 + 带封面的卡片网格 + 热门排名 rail**,并重排顶栏。视觉方向已由 mock 敲定,参考 `docs/design/home-redesign.html`(自包含,可切亮/暗)。**保留现有 oklch 配色与排版气质,只做"加料",不推翻设计系统。**

## 硬约束(照抄 mock 前必读,避免踩坑)
1. **主题是 class-based**:真站用 next-themes,暗色靠根节点 `.dark` class(`globals.css` 里 `@custom-variant dark (&:is(.dark *))`)。mock 里的 `@media (prefers-color-scheme)` / `data-theme` **不要搬过来**——所有暗色样式走 `.dark`(Tailwind `dark:` 前缀或 `.dark` 选择器)。
2. **不要改全局 `.shell`**:它已是 `max-width: 100rem`,全站(页头/页脚/所有页面)共用。mock 里的 90rem 只是 mock 取值;真站首页直接用现有 `.shell` 即可,别新增窄 cap、别改这个值。
3. **字体不动**:真站已通过 `@fontsource-variable/inter` + `noto-sans-sc` 加载;mock 用的是系统栈近似。
4. 复用现有 token 与原语(`--primary` / `--muted` / `--hairline` / `--rule-strong` / `.headline` / `.eyebrow` / `.date-anchor` / `tabular-nums`)。

## 1. 新增设计 token(`app/globals.css`)
在 `:root` 和 `.dark` **各加一份**(照现有 token 的写法):
- `--warm`:一个克制的暖色,只用于"头条"标记和热门第 1 名。亮色约 `oklch(0.70 0.16 52)`,暗色约 `oklch(0.78 0.14 58)`。
- `--shadow`:卡片用的柔和投影(亮/暗各一版,见 mock)。
- 卡片圆角可复用现有 `--radius`,或加 `--radius-card: 14px`。
同时在 `@theme inline` 里按现有模式暴露 `--color-warm`(若需要用 Tailwind 类引用)。

## 2. 顶栏改版(`components/site-header.tsx`)
现状:logo 在左,导航+搜索图标+主题挤在最右。目标改为**左右两组**:
- **左组**:logo(wordmark)**紧挨着**主导航,成一组(mock 的 `.left`,gap ~2rem;导航项间 gap ~1.7rem)。导航保留你现有 `navigation` 数组的语义,不擅自删项;如果想精简,单独问用户(mock 里演示的是 最新/归档/分类/标签/系列 五项,真站现有是 文章/分类/标签/系列/关于/账户,**默认保留现有六项、只移动位置**,是否精简由用户定)。
- **右组**:**默认渲染的行内搜索框**(替换现在的搜索图标)+ 现有 `<ThemeToggle />`。
  - 搜索框是一个 `GET` 表单:`<form action="/search">` + `<input name="q" maxLength={100} placeholder="搜索文章…">`,和 `/search` 页现有表单契约一致(`app/search/page.tsx` 就是读 `searchParams.q`)。左侧嵌 lucide `Search` 图标。聚焦时可微展开/变亮(见 mock `.search input:focus`)。
  - **响应式**:窄屏(< 640px)搜索框收起,退回现在的搜索图标链接(指向 `/search`);≥640px 显示完整搜索框。导航本就 `lg` 才显示,保持。
- 顶栏保留 sticky + 毛玻璃(现有 `backdrop-blur` 已有)。

## 3. 首页改版(`app/page.tsx`)
保留顶部 thesis 区块(eyebrow + headline + lede)不动。下面重构:

### 3a. 头条大卡 `FeaturedPost`(新组件)
- 取一篇作头条:**优先 `pinned` 的最新一篇,否则最新一篇**。数据用现有 `getPublishedPosts`(已返回 `pinned/cover/categoryName/categorySlug/charCount/publishedAt`);若需要浏览量可并 `getPopularPosts` 或忽略。
- 布局:左图右文的大卡(mock `.featured`,≥820px 两栏,窄屏堆叠),`--shadow` + 圆角 + `--border`。
- 左图:有 `cover` 用 `next/image`;**没有则用兜底封面**(见 §4)。
- 右文:"头条"kicker(用 `--warm`)、大标题(link 到 `/posts/[slug]`,hover 下划线滑入)、摘要、meta 行(分类 chip + 日期 + 阅读时长,复用 `readingMeta(charCount)`)。

### 3b. 最新文章卡片网格
- 现在的 `最新文章` 列表(用 `PostRow` 竖排)改为**卡片网格**(mock `.cards`,≥560px 两栏)。取头条之外的接下来 4 篇。
- **新增 `PostCard` 组件**(不要改 `PostRow`——它还被 `/posts` 年份归档、`/tags/[slug]`、`/search`、分类页复用,归档页保留时间线行式)。`PostCard`:顶部封面(16:9,真图或兜底)+ 分类 chip + 标题 + 两行摘要(line-clamp)+ meta(日期·阅读时长);hover 上浮 + 描边转靛蓝。
- 章节头 `最新文章` + `查看全部 →`(链 `/posts`),复用 `--rule-strong` 顶线。

### 3c. 热门 rail
- 保留现有 `PopularPosts`(`getPopularPosts(5)`),放右栏。可按 mock 微调为"排名 + 阅读量"的样式(编号是真实排名,有信息含义);第 1 名编号用 `--warm`。
- 主体两栏:`≥1000px` 时 `minmax(0,1fr) 17rem`(内容 + rail),窄屏堆叠。

## 4. 兜底封面 `GeneratedCover`(新组件,复用价值最高)
文章没上传封面时,渲染一张**程序化封面**,而不是留白或参差。
- **视觉语言直接复用 OG 图那套**(`app/posts/[slug]/opengraph-image.tsx`:深底 + 细网格 + 靛蓝同心环),做成 CSS 版(纯背景渐变/边框实现,见 mock `.art` / `.rune`,无需真图)。
- 服务端组件,入参 `{ title, label?, seed }`;按 `seed`(如 slug 哈希)在**几个色相变体**间确定性选择(mock 的 `.v2/.v3`),制造差异但不出画。
- 可选在角落叠 `label`(如分类名或**系列名**——和 series 功能天然联动)+ 标题短名。
- 在 `FeaturedPost`、`PostCard`、以及 `PostRow` 的封面位统一用它兜底(`cover` 为空时)。

## 通用要求
- 亮/暗双主题都要顺(用 `.dark`,别用媒体查询);兜底封面在两主题下都清晰。
- `prefers-reduced-motion` 下关掉 hover 位移/过渡(现有 globals 已有该 block,新组件沿用)。
- 键盘 focus 可见(现有已有 `:focus-visible`)。
- 宽内容(卡片网格)靠 grid + gap,不用逐元素 margin;body 不横向溢出。
- 复用 `.shell` 版心;不新增全局宽度变量。

## 验收标准
- [ ] 首页:thesis + 头条大卡 + 卡片网格 + 热门 rail;头条取 pinned/最新。
- [ ] 顶栏:左=logo+导航一组,右=默认搜索框+主题;搜索框提交跳 `/search?q=`;窄屏退回搜索图标。
- [ ] 没封面的文章在首页显示程序化兜底封面(非留白),多篇之间有色相差异。
- [ ] `PostRow` 未被破坏(归档/标签/搜索/分类页仍正常)。
- [ ] 暗色走 `.dark`,亮暗都清晰;`prefers-reduced-motion` 生效。
- [ ] 全局 `.shell` 未被改动。
- [ ] `tsc --noEmit`、ESLint、build、测试全绿。

## 交付说明
- 新增组件清单(`FeaturedPost` / `PostCard` / `GeneratedCover`)与改动文件。
- 新增 token 列表。
- 顶栏导航是否精简(默认保留现有六项)。
- 确认没动全局 `.shell`、暗色用 `.dark` 而非媒体查询。
