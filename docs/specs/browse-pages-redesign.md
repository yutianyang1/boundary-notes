# Codex Spec:浏览类页面视觉改版(标签/分类/系列/搜索/归档)

## 目标
把内容浏览类页面按首页新风格拉齐:文章列表统一用**卡片网格**(复用已落地的 `PostCard`),并给这些页配统一的页头与词条卡。用户已确认列表用卡片。

**覆盖页面**:
- 词条详情:`app/tags/[slug]`、`app/categories/[slug]`、`app/series/[slug]`
- 搜索:`app/search`
- 归档:`app/posts`
- 索引:`app/tags`、`app/categories`、`app/series`

(`about` / `account` / 登录注册等表单/静态页**不在本 spec**,形态不同,另行处理。)

## 硬约束(同前几份)
- 复用已上线组件:`PostCard`、`GeneratedCover`(`components/home/`)、`--warm`/`--shadow`/`--radius-card` token、accent chip 样式。
- 暗色走 `.dark`,不要 `prefers-color-scheme`;全局 `.shell`(100rem)不动。
- 各查询函数(`getPublishedPostsByTag/Category`、`getPublishedSeries`、`searchPublishedPosts`、`getPublishedPosts`、`getPublished*List`)**逻辑与返回不动**,只改页面渲染。

## 1. 新增共享组件

### `PageHeader`(词条/列表页统一页头)
入参 `{ eyebrow, title, description?, count? }`。渲染:小标签(eyebrow,主色)+ 大标题(`.headline`)+ 可选描述 + 可选"共 N 篇"。所有词条详情页与索引页都用它,替换现在各页手写的 `<header>`。

### `TermCard`(索引页的词条卡)
用于分类/系列索引。入参 `{ href, name, description?, count, cover?, seed }`。卡片:
- 顶部图:系列有 `cover` 用 `<Image>`,否则用 `<GeneratedCover title={name} label="系列" seed={slug} />`;分类无封面字段,统一用 `GeneratedCover`(label="分类")。
- 正文:名称(标题体)+ 可选描述(两行截断)+ "N 篇"。
- hover 上浮描边,与 `PostCard` 一致(`--shadow` + `--radius-card`)。

## 2. 词条详情页(tags/categories/series 的 `[slug]`)+ 搜索
把现在的 `PostRow` 列表替换为 **`PostCard` 卡片网格**:
- 布局:`grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3`(与对比 mock 的 A 版一致)。
- 页头改用 `PageHeader`:
  - tags/[slug]:eyebrow「标签」,title `#{tag.name}`,count 用 `posts.length`。
  - categories/[slug]:eyebrow「分类」,title `category.name`,description `category.description`,count。
  - series/[slug]:eyebrow「系列」,title `series.name`,description。**系列成员卡按 `seriesOrder` 顺序**,并在卡上或标题前标序号(第 1/2/3…篇)——系列是有序的,序号有信息含义,保留。
- 搜索页:保留现有 GET 表单(顶部),结果区把 `PostRow` 换成 `PostCard` 网格;无结果的空态文案保留。搜索框样式可与首页顶栏搜索呼应。

## 3. 归档页 `app/posts`
保留**按年份分组**(现有逻辑),每个年份 section 内把 `PostRow` 换成 `PostCard` 网格:
- 结构:年份标题(`date-anchor`,大字 + 该年篇数)+ 下面卡片网格。
- 顶部页头用 `PageHeader`(eyebrow「归档」,title「全部文章」,count 总篇数)。
- 骨架屏(`PostRowSkeleton`)相应替换为卡片骨架。

## 4. 索引页
- **`app/categories`**:改成 `TermCard` 网格(`getPublishedCategoryList` 已返回 name/slug/description/count)。页头用 `PageHeader`。
- **`app/series`**:改成 `TermCard` 网格(`getPublishedSeriesList` 返回 name/slug/description/cover/count,cover 直接用,无则 GeneratedCover 兜底)。
- **`app/tags`**:标签通常很多,**不铺满卡片**——保留"标签云"形态但美化:更大的圆角 chip(`#名称 + N`),hover 变主色描边,和文章页标签 chip 一致。页头用 `PageHeader`。

## 5. 清理
- 迁移完成后,`PostRow` / `PostRowSkeleton` 若不再被任何页面引用,可删除;若你想留作它用则保留,但**本次不要再让新页面依赖它**。请在交付说明里注明 `PostRow` 最终去留。

## 通用要求
- 亮/暗双主题(`.dark`);`prefers-reduced-motion` 关过渡(现有 globals 已有)。
- 卡片网格靠 grid+gap;无封面文章走 `GeneratedCover`,同一页多张之间有色相差异(seed=slug 已保证)。
- 键盘 focus 可见;body 不横向溢出。

## 验收标准
- [ ] tags/[slug]、categories/[slug]、series/[slug]、search 的文章列表均为 `PostCard` 卡片网格;系列按顺序且带序号。
- [ ] `/posts` 归档按年份分组、每组为卡片网格。
- [ ] categories、series 索引为 `TermCard` 网格(系列带封面/兜底);tags 索引为美化后的标签云。
- [ ] 所有上述页头统一用 `PageHeader`。
- [ ] 无封面文章显示程序化封面;暗色正常;全局 `.shell` 未动;查询逻辑未改。
- [ ] `PostRow` 去留已在交付说明中明确;`tsc`、ESLint、build、测试全绿。

## 交付说明
- 新增组件(`PageHeader`、`TermCard`)与改动页面清单。
- 确认复用了 `PostCard` / `GeneratedCover`,未重复造。
- `PostRow` / `PostRowSkeleton` 最终去留。
