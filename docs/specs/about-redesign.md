# Codex Spec:关于页(/about)视觉改版

## 目标
把现在只有两段话的占位 `app/about/page.tsx` 做成一张有结构的"门面"页:左正文 + 右个人名片的 Hero、在写什么、手头在做、代表文章、联系方式。方向已由 mock 敲定,参考 `docs/design/about-redesign.html`。

## 硬约束
- 暗色走 `.dark`(next-themes),不要 `prefers-color-scheme`;复用现有 token(`--warm`/`--shadow`/`--radius-card`/`--accent`)与 `.shell` 版心。
- **左对齐**:所有内容左边缘与顶栏 `BrandMark`、页脚落在同一基准线(即直接放在 `.shell` 内、靠左),**不要居中**(居中会和左对齐的顶栏错落——这是上一版改掉的问题)。
- 用掉右侧留白的方式是"**正文窄列 + 右名片 + 下方卡片铺满**",**不是**把正文行宽拉长。正文文字保持约 40em 可读宽度。

## 结构与实现

### 1. Hero(两栏:左正文 + 右名片)
- 容器:`grid`,`≥940px` 时 `grid-template-columns: minmax(0,1fr) 20rem`,窄屏堆叠。
- **左**(`max-width: 40em`):eyebrow「关于」+ 大标题(`.headline`,"边界"二字用暖色下划线高亮:`linear-gradient(transparent 62%, warm 62%)` 一类)+ lede 自我介绍 + 两段正文(`.article-body` 排版气质,行高 1.85)。**文案作者自填**,mock 里的是示例。
- **右个人名片**(`components/about/profile-card.tsx` 一类,新组件):
  - 顶部 banner 用**你现有的程序化图版语言**(深底 + 网格 + 靛蓝环,和 `GeneratedCover` 同源)。`GeneratedCover` 当前会渲染标题文字,名片 banner 不需要文字——**要么给 `GeneratedCover` 加一个"仅图案"模式,要么把那段图案 CSS 复用为一个 banner class**,择一,别再拷第三份。
  - 头像:优先用作者上传头像(若有,复用文章页 byline 的取图逻辑),否则首字母 + `conic-gradient(primary→warm)` 圆底(和 byline 兜底一致)。
  - 名字 + 一行角色(如"实时语音 · 系统架构")。
  - 快照 facts(坐标 / 在做 / 已发布 N 篇);**"已发布 N 篇"建议取实时值**(复用 `getPublishedPosts` 计数或一个轻量 count),其余为静态文案。
  - 链接:邮箱 / GitHub / RSS。见 §5 的环境变量口径。

### 2. 在写什么(三张聚焦卡)
- 三张卡:实时语音系统 / 系统架构 / 工程实践(和站内分类对应)。每卡:图标 + 标题 + 一句说明。
- **建议每张卡链到对应的 `/categories/<slug>`**(把"在写什么"和真实分类打通),分类 slug 由作者配置。hover 与 `PostCard` 一致(上浮 + 描边 + `--shadow`)。

### 3. 手头在做(Now)
- 2 列(窄屏 1 列)卡片,每条:暖色小圆点(带光晕)+ 标题 + 说明。内容静态,作者自填(如 Barge-in 服务、这个博客平台本身)。

### 4. 代表文章
- 引导新读者的 3~5 篇精选。**建议做成"作者维护一个 slug 列表 → 查库取真实标题/分类"**,避免标题改了这里不同步;若嫌重可退化为静态 `{href,title,category}`,在交付说明里注明选了哪种。
- 样式:一行一篇,标题 + 分类,hover 变主色(mock `.picks`/`.pick`)。

### 5. 联系方式
- 胶囊链接:邮箱、GitHub、RSS(`/feed.xml`)。
- **邮箱 / GitHub 从环境变量读**(如 `NEXT_PUBLIC_CONTACT_EMAIL`、`NEXT_PUBLIC_GITHUB_URL`),**有值才渲染对应项**(和页脚备案号一个套路,别把私人邮箱写死进源码);RSS 恒定渲染。`.env.example` 补上这两个键。
- 页面顶部的 `generateMetadata` 保留/完善(title「关于」+ description)。

## 通用要求
- 亮/暗双主题协调(`.dark`);`prefers-reduced-motion` 关过渡(现有 globals 已有)。
- 名片/卡片用 grid+gap;键盘 focus 可见;`.shell` 不改;body 不横向溢出。
- 外链 `rel="noreferrer"`,`target="_blank"` 视情况。

## 验收标准
- [ ] Hero 两栏:左正文(≤40em)+ 右个人名片,窄屏堆叠;内容左边缘与顶栏/页脚对齐(非居中)。
- [ ] 名片 banner 复用程序化图版(未拷第三份);头像有上传用上传、无则首字母兜底。
- [ ] 在写什么三卡可链到对应分类;手头在做 2 列;代表文章可点进真实文章。
- [ ] 邮箱/GitHub 环境变量有值才渲染,无值不显示;RSS 常在;`.env.example` 已补。
- [ ] 右侧留白被名片/铺满的卡片区消化,正文行宽仍克制。
- [ ] 亮/暗正常;`tsc`、ESLint、build、测试全绿。

## 交付说明
- 新增组件(名片)与改动文件;名片 banner 复用了 `GeneratedCover` 的哪种方式(仅图案模式 / 共享 banner class)。
- "已发布 N 篇"与"代表文章"是实时取库还是静态,及理由。
- 新增环境变量(`NEXT_PUBLIC_CONTACT_EMAIL`、`NEXT_PUBLIC_GITHUB_URL`)。
