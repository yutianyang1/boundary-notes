# Codex Spec:系列 / 专栏

## 目标
把同主题的多篇文章串成一个**有序系列**(如"实时语音"系列:Barge-in 架构、ASR 热词、标点补全…),让读者能:
1. 在文章页看到"本文属于系列 X · 第 n / m 篇",并直接跳到系列里的上一篇 / 下一篇;
2. 有一个系列目录页 `/series` 和单个系列页 `/series/<slug>`(按顺序列出全部成员)。

这是四项内容发现里唯一**从零做**的(搜索/标签/归档/媒体库都已完成)。分类是"多对多、无序"的,系列是"一对一归属 + 显式顺序",两者不同,不要复用分类实现。

## 现状
- 目前 schema **没有** series 相关表。
- `posts` 有 `categoryId`(分类)、`postTags`(标签),但都不含"系列内顺序"的语义。
- 参照物:标签的 `getPublishedPostsByTag` / `/tags/[slug]`、分类页 spec —— 系列的**列表/详情页**结构类似,但多了"排序"和"文章页内的上一篇/下一篇导航"。

## 数据模型(首选:专表 + posts 上两列)
一篇文章**至多属于一个系列**,且需要显式顺序 —— 用专表存系列元数据,再在 `posts` 上加归属列,prev/next 查询最简单:

新增表 `series`:
| 字段 | 说明 |
|---|---|
| `id` | uuid 主键 |
| `slug` | varchar(180),部分唯一索引 `where deleted_at is null`(照抄 categories/tags 的 slug 索引写法) |
| `name` | varchar(120) |
| `description` | text 可空 |
| `cover` | text 可空(系列封面,可选) |
| `createdAt/updatedAt` | 复用 schema 里的 `timestamps` |
| `deletedAt` | 软删 |

`posts` 增列:
- `seriesId` uuid 可空,`references(() => series.id, { onDelete: "set null" })`;
- `seriesOrder` integer 可空(系列内序号,从 1 起)。
- 加索引 `index("posts_series_order_idx").on(seriesId, seriesOrder)`,支撑系列内排序和 prev/next。

> **为什么不用 join 表**:一篇文章只归属一个系列,列在 posts 上让"上一篇/下一篇""第 n/m 篇"都是对同一表的简单查询,无需额外 join。若日后要"一篇进多个系列",再迁移到 `post_series(postId, seriesId, position)` join 表。**实现时按上面的单系列模型做**,并在 PR 说明里点明这个取舍。

出一份 Drizzle migration。

## 查询(`lib/posts/queries.ts`,复用 `publiclyVisible`)
- `getPublishedSeriesList()`:返回 `{ name, slug, description, cover, count }[]`,count 为系列下公开文章数,按 count/name 排序。`"use cache"` + `cacheTag(cacheTags.posts, cacheTags.series?)` —— **需要在 `lib/cache/tags.ts` 里新增 `series(slug)` 缓存标签**,参照已有的 `tag(slug)`/`category(slug)`。
- `getPublishedSeries(slug)`:查系列元数据(`isNull(deletedAt)`),查不到返回 `null`;返回 `{ series, posts }`,posts 为该系列下公开文章**按 `seriesOrder asc` 排序**(null order 排最后,可用 `nulls last`),字段沿用现有卡片形状 + `seriesOrder`。
- `getSeriesNavForPost(postId)`:给文章页用,返回该文所属系列的 `{ series: {name, slug}, total, position, prev, next }`,其中 prev/next 是系列内**公开可见**的相邻文章(按 `seriesOrder`);文章不属于任何系列则返回 `null`。prev/next 只需 `{ slug, title }`。注意可见性:prev/next 只在公开成员里取,草稿/未到点的不算。

## 页面
- `app/series/page.tsx`:系列目录,镜像 `/tags` 的结构,列出系列(名称+描述+封面缩略+篇数),链到 `/series/<slug>`。
- `app/series/[slug]/page.tsx`:单系列页,顶部系列名+描述,下面**按顺序**列出成员(带序号 1/2/3…);`null` 时 `notFound()`;有 `generateMetadata`。
- **文章页**(`app/posts/[slug]/page.tsx`)加一个系列区块:用 `getSeriesNavForPost` 渲染"本文属于系列《X》· 第 n / m 篇" + 上一篇/下一篇链接。位置建议放正文上方或正文末尾(与现有"相关文章"区块风格协调)。文章不属于系列时不渲染该区块。

## 后台管理
- 系列 CRUD(建/改/软删),字段 name/slug/description/cover。可放在 `app/admin/` 下,权限沿用现有 staff 口径(`requireStaff` / `canManagePost` 的同类)。
- **给文章指定系列 + 序号**:在文章编辑器(`components/admin/post-editor-form.tsx`)加两个字段——选择系列(下拉)+ 系列内序号。保存走 `savePostAction`(`app/admin/posts/actions.ts`),把 `seriesId`/`seriesOrder` 一起写入并记 `postRevisions`/审计(与现有字段一致)。
  - 序号冲突策略:同系列同 `seriesOrder` 不强制唯一(允许作者临时重复),但列表按 order 再按 publishedAt 兜底排序;**或**在系列内做唯一约束——二选一,在 PR 说明。建议**不加硬唯一约束**,以免调整顺序时互相打架,靠排序兜底即可。
- slug 归一化复用 `lib/posts/slug.ts` 的 `normalizeSlug`(和 tag/category 一致,支持中文)。

## 通用要求
- 复用 `PostRow`/卡片组件、`.shell` 版心、亮暗色。
- 缓存:系列元数据/成员变化时,失效相关 `cacheTags.series(slug)` 与 `cacheTags.posts`;保存文章改动 series 归属时同样失效。参照现有 `savePostAction` 的 `revalidate`/`cacheTag` 用法。
- 可见性口径与标签/分类完全一致(`publiclyVisible`)。

## 验收标准
- [ ] 后台能建系列、把文章加入系列并指定顺序。
- [ ] `/series` 列出系列;`/series/<slug>` 按顺序列出成员;不存在的 slug 404。
- [ ] 文章页显示"第 n / m 篇" + 上一篇/下一篇,且 prev/next 只在公开成员间跳转,首篇无上一篇、末篇无下一篇。
- [ ] 文章从系列移除 / 系列软删后,文章页系列区块消失、系列页不再列出,且不 500。
- [ ] 可见性口径与标签/分类一致。
- [ ] Drizzle migration 干净;`tsc`、lint、build、test 全绿;为三个查询(list / detail / nav)加 `lib/posts/queries.test.ts` 用例,尤其覆盖 prev/next 边界(首篇、末篇、含不可见成员)。

## 交付说明
- Drizzle migration 内容;确认选了"单系列 + posts 两列"模型及理由。
- 新增 `cacheTags.series` 及失效点。
- 后台指定系列/序号的落点(编辑器字段 + savePostAction 改动)。
- prev/next 可见性与边界的处理说明。
