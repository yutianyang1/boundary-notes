# Codex Spec:页脚(SiteFooter)视觉改版

## 目标
把 `components/site-footer.tsx` 拉齐到新站点风格,和改版后的顶栏、卡片体系一致。页脚出现在每一页,现在还是旧样式(平、无新 token、logo 标记和新顶栏不一致),不美化最扎眼。**这是重排 + 换皮 + 少量补充,不引入新数据。**

## 现状
- 现有结构:品牌列(旧 logo 竖条 + 名称 + 一句标语)+ 单列导航(文章/分类/标签/系列/搜索/关于/RSS)+ 底部版权行。
- 旧 logo 标记是 `<span class="h-4 w-[3px] bg-primary">`,**与新顶栏的锥形渐变方块不一致**。
- 版权年从 `process.env.NEXT_PUBLIC_COPYRIGHT_YEAR` 读,保留。

## 硬约束
- 暗色走 `.dark`(next-themes),不要 `prefers-color-scheme`;复用 `--warm`/`--shadow`/`--radius-card`/`--hairline` 等现有 token 与 `.shell` 版心。
- 不新增外部数据/查询;链接沿用现有集合。

## 改动

### 1. 品牌标记与新顶栏统一
把页脚左上的 logo 标记换成**和 `SiteHeader` 一致的锥形渐变方块**(顶栏 `.mk`:`conic-gradient(from 210deg, var(--primary), color-mix(in oklch, var(--primary) 55%, var(--warm)))`,圆角小方块)+ "边界笔记"。品牌下保留那句标语(现有文案)。
> 建议:把这个 wordmark 抽成一个共享小组件(如 `components/brand-mark.tsx`),顶栏和页脚共用,避免两处渐变值漂移。若改动过大可不抽,但两处视觉必须一致。

### 2. 导航分组(单列 → 两组)
现在的一长列链接拆成**两组带小标题的列**,信息更有结构:
- **浏览**:文章(归档)、分类、标签、系列
- **站点**:关于、搜索、RSS(`/feed.xml`)
每组一个 eyebrow 小标题(`.eyebrow`,muted)。链接 hover 变主色(现有交互保留)。桌面并排、窄屏堆叠。

### 3. 版式与质感
- 顶部保留 `border-t`,但整块可给一个极浅的区隔:用 `bg-card` 或 `bg-muted/40` 一类的浅背景把页脚和正文分开(轻,别抢眼)。
- 布局:左品牌列 + 右链接组,`.shell` 版心,`flex`/`grid` + gap,响应式堆叠(参考现有结构)。
- 底部行:`© {year} 边界笔记` + **预留一个备案号槽位**(见 §4)。

### 4. 备案号槽位(合规,重要)
站点正在走 ICP 备案,备案通过后**页脚必须展示备案号并链接到 工信部备案系统**(法规要求)。现在先预留:
- 从环境变量读,如 `process.env.NEXT_PUBLIC_ICP_BEIAN`;**有值才渲染**一行:`<a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{备案号}</a>`,无值不渲染(不写死占位)。
- 放在底部版权行旁(同一行或其下),muted、小字。

## 通用要求
- 亮/暗双主题都协调(`.dark`);`prefers-reduced-motion` 下无多余动效(hover 颜色过渡即可)。
- 键盘 focus 可见;`.shell` 不改;body 不横向溢出。
- 纯展示,无客户端状态。

## 验收标准
- [ ] 页脚 logo 标记与新顶栏一致(锥形渐变方块)。
- [ ] 链接分成「浏览 / 站点」两组带小标题,响应式堆叠。
- [ ] 整块与新站点风格协调(token 复用、浅背景区隔)。
- [ ] `NEXT_PUBLIC_ICP_BEIAN` 有值时展示备案号并外链工信部,无值时不渲染该行。
- [ ] 亮/暗都正常;`tsc`、ESLint、build、测试全绿。

## 交付说明
- 是否抽了共享 `BrandMark`(顶栏/页脚共用);若否,如何保证两处一致。
- 新增读取的环境变量(`NEXT_PUBLIC_ICP_BEIAN`)及 `.env.example` 是否补充说明。
