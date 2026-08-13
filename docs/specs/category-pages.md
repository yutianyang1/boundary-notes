# Codex Spec:分类浏览页(/categories)

## 目标
补上按**分类**浏览文章的落地页,和现有的标签页(`/tags`、`/tags/[slug]`)对称。文章卡片和文章页上已经显示分类名,但点不进去——现在没有分类的浏览入口。

## 现状(严格照抄标签页的实现,别另起炉灶)
分类的数据层已经齐了,缺的只是"查询函数 + 页面",而且**标签页已经把同样的形状做过一遍**,直接镜像:

- 表 `categories`(`lib/db/schema.ts`):`id / slug / name / description / deletedAt`,有 `categories_slug_active_unique` 部分唯一索引。**注意:categories 比 tags 多一个 `description` 字段**,落地页要用上。
- `posts.categoryId`(可空,`onDelete: set null`)。
- 缓存标签 `cacheTags.category(slug)` 已存在(`getRelatedPosts`/`getPublishedPost` 在用)。
- 参照物:`lib/posts/queries.ts` 里的 `getPublishedPostsByTag()` 与 `getPublishedTagCloud()`,页面 `app/tags/page.tsx` 与 `app/tags/[slug]/page.tsx`。**分类页 = 把这两套复制一份、把 tag 换成 category。**

## 实现

### 1. 查询(`lib/posts/queries.ts`)
新增两个函数,严格镜像标签版:

- `getPublishedCategoryList()`:镜像 `getPublishedTagCloud()`,返回 `{ name, slug, description, count }[]`,`count` 为该分类下**公开可见**文章数(复用文件里已有的 `publiclyVisible` 条件),按 count desc、name 排序。`"use cache"` + `cacheTag(cacheTags.posts)` + `cacheLife("feed-index")`,与现有一致。
- `getPublishedPostsByCategory(categorySlug, limit = 100)`:镜像 `getPublishedPostsByTag()`,先查分类(`isNull(categories.deletedAt)`),查不到返回 `null`;否则返回 `{ category: { name, slug, description }, posts: [...] }`,posts 字段与 `getPublishedPostsByTag` 返回的完全一致(id/slug/title/summary/cover/publishedAt/pinned/categoryName/categorySlug/charCount),`orderBy(desc(pinned), desc(publishedAt))`。`cacheTag(cacheTags.posts, cacheTags.category(categorySlug))`。

### 2. 页面
- `app/categories/page.tsx`:镜像 `app/tags/page.tsx`,列出所有分类(名称 + 描述 + 篇数),每个链到 `/categories/<slug>`。
- `app/categories/[slug]/page.tsx`:镜像 `app/tags/[slug]/page.tsx`,`getPublishedPostsByCategory` 返回 `null` 时 `notFound()`;顶部显示分类名 + `description`;下面用现有 `PostRow`/文章卡片组件列出文章。要有 `generateMetadata`(标题/描述,description 优先)。

### 3. 入口接线
- 文章卡片、文章页上现在显示的**分类名**改成链接,指向 `/categories/<slug>`(标签已经是可点的,分类照做)。
- 如果站点导航/页脚里有"标签"入口,并列加一个"分类"。

## 通用要求
- 复用现有 `PostRow` / 卡片组件与 `.shell` 版心,视觉和 `/tags/[slug]`、`/posts` 保持一致。
- slug 走 `decodeURIComponent`(和标签页一样,支持中文 slug)。
- 亮/暗色、响应式沿用现有组件,无需新样式。

## 验收标准
- [ ] `/categories` 列出所有有公开文章的分类,带描述和篇数,可点进。
- [ ] `/categories/<slug>` 列出该分类下公开文章;不存在的 slug 404。
- [ ] 文章卡片/文章页的分类名可点击跳到分类页。
- [ ] 分类页的可见性口径与 `getPublishedPostsByTag` 完全一致(published + 到点的 scheduled,排除 deleted)。
- [ ] `tsc --noEmit`、lint、build、test 全绿;为两个新查询各加一条 `lib/posts/queries.test.ts` 用例(参照标签查询的测试)。

## 交付说明
- 新增/改动文件清单。
- 确认与标签页的行为对齐(可见性、排序、缓存、slug 处理)。
