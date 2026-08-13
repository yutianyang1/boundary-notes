# ADR-0001: 博客平台架构决策

- **状态**: Accepted（冻结）
- **日期**: 2026-07-22
- **适用范围**: 平台整体架构。单项决策变更需新开 ADR 并在此标注 superseded。

## 1. 背景与约束

自建工业级博客平台，视觉风格为简约现代 + light/dark 双主题。

已确定的两个前置约束（它们决定了下游大量选型）：

| 约束 | 取值 |
|---|---|
| 部署形态 | 自托管，单机 Docker Compose |
| 使用规模 | 小团队多作者，含审核发布流 |

单机部署解锁了 PostgreSQL 扩展自由安装、免分布式缓存一致性；多作者则要求角色权限、审计日志、乐观锁、版本历史。

## 2. 技术栈

| 项 | 决策 |
|---|---|
| 框架 | Next.js **16.2.x**（16.3 仍为 Preview，不采用），`output: 'standalone'` |
| 语言 | TypeScript strict |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 数据库 | PostgreSQL + Drizzle ORM / Drizzle Kit 迁移 |
| 全文检索 | PGroonga（PG 镜像内置扩展） |
| 缓存/计数 | Redis |
| 反向代理 | Nginx（仅 TLS 终止与静态直出，**不做页面缓存**） |

---

## 3. 缓存语义（Cache Components）

### 3.1 开启 cacheComponents

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: { /* 见 3.3 */ },
}
```

**语义要点（区别于 Next.js 15）：**

- 页面默认允许动态执行。
- 数据库读取等异步数据必须显式置于 `'use cache'` 内，或放在 `<Suspense>` 之后作为动态区域。
- 纯同步、无运行时数据的部分仍自动进入静态 shell —— **不需要给每个组件都写 `'use cache'`**。
- 未处理的 uncached/runtime 数据在 dev 或 build 阶段直接报错，而非静默降级为整页动态。这是该模型的主要收益：缓存边界从隐式约定变成编译期契约。

### 3.2 缓存函数编写规范（强制）

每个缓存函数**必须同时声明 `cacheTag` 与显式 `cacheLife`**。禁止依赖默认 profile —— 继承默认值会让实际新鲜度无法从调用点判断。

```ts
export async function getPublishedPost(slug: string) {
  'use cache'
  cacheTag('posts', `post:${slug}`)
  cacheLife('published-content')

  return db.query.posts.findFirst(/* ... */)
}
```

### 3.3 标签词汇表与 cacheLife profile

**标签词汇表**（唯一来源，集中在 `lib/cache/tags.ts` 导出常量，禁止裸字符串）：

```
post:{slug}       单篇文章
posts             全部文章列表
category:{slug}   分类列表
tag:{slug}        标签列表
sitemap           站点地图
feed              RSS/Atom
```

**profile 定义**（`expire` 必须大于 `revalidate`，这是 Next.js 的硬性要求）：

| profile | 用途 | stale | revalidate | expire |
|---|---|---|---|---|
| `published-content` | 已发布文章正文，以标签失效为主 | 3600 | 86400 | 604800 |
| `feed-index` | 首页/分类/标签/RSS/sitemap | 60 | 300 | 900 |
| `negative` | 未发布文章详情的 404/null 结果 | 0 | 60 | 300 |

> 以上为**起始值，需上线后按实际访问模式实测调整**，不作为性能承诺。

`negative` profile 是必需项：定时文章的 URL 在发布前若被访问（爬虫、预告链接），产生的 404 会被缓存；没有短期限的负缓存，文章到点后仍长时间不可见。

### 3.4 失效调用矩阵（强制）

| 场景 | 调用 | 理由 |
|---|---|---|
| 后台人员经 Server Action 发布/撤回/修改 | `updateTag(tag)` | read-your-own-writes，下次请求阻塞等待新数据 |
| 定时任务、外部 webhook（Route Handler 内） | `revalidateTag(tag, { expire: 0 })` | `updateTag` 在 Route Handler 中会抛错；需要立即过期 |
| 非关键后台刷新 | `revalidateTag(tag, 'max')` | stale-while-revalidate，允许短暂陈旧 |

**约束：**

- `updateTag` **只能**在 Server Action 中调用，在 Route Handler / Client Component / 其他上下文中调用会抛出 `updateTag can only be called from within a Server Action`。
- 单参数形式 `revalidateTag(tag)` **已废弃**（当前仅在抑制 TS 报错时可用，未来版本可能移除）。**通过 ESLint 规则禁止**该写法，强制两参数签名。
- `revalidateTag(tag, 'max')` 是 SWR 语义：失效只在下次有页面访问该标签时发生，且首个访问者仍拿到陈旧内容。**因此定时发布不能用 `'max'`**，必须用 `{ expire: 0 }`。

---

## 4. 定时发布

### 4.1 架构

不由 `instrumentation.ts` + node-cron 直接承担完整调度职责。原因有二：其一，每个 server instance 的 `register()` 都会执行一次，滚动发布期间天然重复；其二，官方仅保证 `revalidateTag` 在 Server Function / Route Handler 上下文可用，**不应让正确性依赖普通后台计时器回调具备完整的 revalidation 上下文**。

```
scheduler 容器（compose 内，轻量 cron 镜像）
        │
        ▼
POST /internal/jobs/publish-scheduled     ← Route Handler，官方支持的失效边界
        │
        ├─ pg_advisory_lock（防并发重入）
        ├─ 条件原子更新，RETURNING slugs
        ├─ revalidateTag(tag, { expire: 0 })  逐 slug + posts/feed/sitemap
        └─ 写 job_runs + 审计日志
```

**采用 compose 内的 scheduler 容器，而非宿主机 cron。** 宿主机 cron 会让调度机制成为环境相关配置：开发机（Windows）没有等价物，生产机（Ubuntu）要单独运维 crontab，两边行为不一致，且调度逻辑游离在版本控制之外。scheduler 容器则在所有环境完全相同、随代码一起版本化、`docker compose up` 即生效。

端点鉴权：随机任务密钥或 HMAC 签名，且仅允许 Docker 内网访问。此设计不是为了微服务化，唯一目的是把缓存失效放进 Next.js 官方支持的调用边界。

### 4.2 原子更新

```sql
UPDATE posts
SET status = 'published',
    updated_at = now()
WHERE status = 'scheduled'
  AND published_at <= now()
RETURNING id, slug;
```

幂等：条件更新天然满足重复执行安全。

### 4.3 查询侧时间谓词（双保险）

所有公开查询统一使用：

```sql
WHERE deleted_at IS NULL
  AND (
    status = 'published'
    OR (status = 'scheduled' AND published_at <= now())
  )
```

**注意其作用边界**：谓词在缓存条目生成时求值，时间流逝本身不会让已缓存结果变化。因此它**不能**单独保证可见性，必须与 3.3 的有限 `cacheLife` 配合 —— 缓存自然过期后重算，谓词才生效。

三者职责划分：

- **原子更新** —— 保证数据库状态正确、幂等；
- **`revalidateTag({ expire: 0 })`** —— 保证及时性（秒级可见）；
- **时间谓词 + 有限 cacheLife** —— 保证 cron 失效时的最终正确性（分钟级兜底）。

调度器由此从"正确性的必要条件"降级为"时效性的优化"。

---

## 5. 缓存持久化：明确不作为正确性要求

需区分两套机制：

| 机制 | 作用域 |
|---|---|
| `cacheHandler` | ISR / 服务器响应缓存 |
| `cacheHandlers` | `'use cache'` / `'use cache: remote'` 的存储 |

Next.js 16 未配置 `cacheHandlers` 时，`default` 与 `remote` 均使用**进程内 LRU**，该缓存隔离于每个进程且**重启即丢失**。挂载 `.next/cache` 并不能持久化这些条目。

**v1 决策：不把缓存当持久数据。**

- 容器重启后允许冷缓存，视为可接受的性能抖动；
- 必须持久化的是：PostgreSQL 数据卷、媒体卷、Redis（见 §8）；
- `.next/cache` 可挂卷作为性能优化，但**不标记为正确性要求**；
- 若未来需要双实例无缝滚动，再实现 Redis `cacheHandlers` + 跨实例标签同步（`updateTags` 写共享存储 / `refreshTags` 每请求前同步 / `getExpiration` 返回最近失效时间戳）。默认内存缓存彼此隔离，`revalidateTag` 不会自动传播到其他实例。

---

## 6. 内容模型与编辑器

### 6.1 真相源

```
content_md        唯一真相源
content_html      可再生成的缓存
renderer_version  渲染管线版本
```

渲染器升级时按 `renderer_version` 批量重刷。`content_html` **不作为可独立编辑的数据源**。

### 6.2 编辑器：CodeMirror 6

v1 采用 CodeMirror 6 Markdown 源码模式 + 实时预览。

不选 Tiptap 的理由并非其缺乏 Markdown 能力 —— `@tiptap/markdown` 已提供官方双向转换与 round-trip 保真 —— 而是该包目前标注为 **early release，边缘情况可能不支持**，不应让一个 early release 的转换层站在唯一真相源前面。若后续确有非技术作者需求，再引入并锁定版本 + 对往返做快照测试。

### 6.3 MDX：v1 不采用

MDX 存数据库意味着运行时编译，构成安全与性能双重负担。富组件需求改由 `remark-directive` 白名单指令满足：

```
:::note / :::warning
::youtube{id=xxx}
::gallery{ids=1,2,3}
```

指令渲染器为固定白名单，**永不执行用户提供的代码**。Markdown 渲染管线统一接 `rehype-sanitize`。

---

## 7. 数据模型

### 7.1 posts 关键字段

```
id, slug, title, summary
content_md, content_html, renderer_version
cover, status, pinned
author_id, revision
seo_title, seo_description, canonical_url
published_at, scheduled_at
created_at, updated_at, deleted_at
```

### 7.2 约束与索引

- **`slug` 部分唯一索引**：`CREATE UNIQUE INDEX ON posts(slug) WHERE deleted_at IS NULL` —— 否则软删除的文章永久占用 slug。
- slug 统一规范化（小写、连字符、CJK 保留）。
- **`post_redirects`**：slug 变更后保留旧值映射，避免外链 404。
- `post_tags(post_id, tag_id)` 联合唯一键；外键删除策略显式声明。
- `posts(status, published_at)` 复合索引支撑列表页。
- **乐观锁**：`revision` 字段，多作者并发编辑时 `WHERE revision = ?` 冲突即拒绝。
- 时间**统一存 UTC**，界面按站点时区展示。

### 7.3 post_revisions

存**全文**而非 diff（博客体量下存储非瓶颈，读取复杂度差异显著）。保留策略：最近 50 版 + 全部已发布版本。

### 7.4 comments

`depth` 字段 + 应用层层级上限（3 层）。不引入 ltree。状态机：`pending / approved / spam`。

### 7.5 settings

不做裸 `(key, value)`。表结构含 `group`、`value_type`；读取侧由单一 zod schema 统一校验并推导类型，避免退化为无类型垃圾桶。

### 7.6 审计

所有后台变更写 `audit_logs`（actor、action、target、before/after 摘要、ip、ua）。`job_runs` 记录调度执行结果。

---

## 8. 部署

### 8.1 Compose 拓扑

`nginx` → `next`(standalone) → `postgres`(含 PGroonga) + `redis`

单机无 serverless 冷启动问题，PostgreSQL 连接池使用 `pg` 内置池，**不引入 PgBouncer**。

### 8.2 Nginx

- **不做页面内容缓存** —— 应用侧 `revalidateTag` / `revalidatePath` 不会穿透清理代理缓存，取消该层可消除一整类失效同步问题。
- 对动态请求**关闭响应缓冲**（`proxy_buffering off`）。自托管时代理缓冲会让 PPR / RSC streaming 失去首字节优势。
- `/_next/static/*`：长期 `immutable` 浏览器缓存（内容哈希命名，不属于易失效内容）。
- 媒体：内容哈希或随机 storage key + 明确缓存策略。

### 8.3 存储

`Storage` 接口抽象；单机默认本地卷 + Nginx 直出。S3/OSS 适配器同期实现但不默认启用 —— 本地磁盘仅在单机形态下可靠，多副本或滚动发布环境必须切 S3。

### 8.4 Redis 数据分级

| 等级 | 内容 | 持久化 |
|---|---|---|
| 可重建 | 限流窗口、可重算缓存 | 无需 |
| 不可重建 | 尚未落库的阅读量 / 点赞 | **必须挂卷 + 启用 AOF** |

计数落库采用**幂等批次**（批次 ID + 已处理标记），避免重放导致重复计数。

### 8.5 可移植性：Windows 开发 → Ubuntu 生产

生产目标平台为 **Ubuntu**。运行时始终是 Linux 容器（Windows 侧经 Docker Desktop / WSL2），因此迁移不涉及架构变更。风险方向不是"迁不过去"，而是 **Windows 特有的开发期问题泄漏进代码库、直到 Linux 构建才暴露**。

**强制约定：**

| 项 | 约定 | 不做会怎样 |
|---|---|---|
| 文件名大小写 | tsconfig 显式开启 `forceConsistentCasingInFileNames`；CI 在 Linux 上构建 | Windows 文件系统不区分大小写，`./components/button` 引用 `Button.tsx` 本地正常，Ubuntu 构建直接失败 |
| 换行符 | `.gitattributes`：`* text=auto eol=lf`，`*.sh text eol=lf` | CRLF 的 shell 脚本在 Linux 报 `bad interpreter: /bin/sh^M` |
| 脚本执行位 | Dockerfile 内用 `sh script.sh` 调用，不依赖 exec bit | Windows 无 chmod 概念，提交的脚本在 Linux 上缺少 `+x` |
| node_modules | `.dockerignore` 排除；镜像内执行 `npm ci`（多阶段构建） | native 依赖（如图片处理的 sharp）编译产物平台相关，从 Windows 拷入镜像必然报错 |
| 数据卷 | postgres / redis 一律用**命名卷**，不用 bind mount | Docker Desktop 掩盖了 UID 差异；Ubuntu 上 bind mount 按宿主 UID 落权限，容器内进程可能写不进去 |
| 上传目录 | 若必须 bind mount，Dockerfile 内固定 UID/GID 并在宿主侧对齐 | 同上，且表现为运行期偶发写失败而非启动即报错 |

**Ubuntu 生产侧新增项（Windows 开发期不存在，需单独验收）：**

- **端口暴露**：compose 中**只发布 nginx 的 80/443**，postgres 5432 与 redis 6379 绝不做 `ports:` 映射，仅走内部网络。Docker 直接操作 iptables，已发布端口可能绕过 UFW 规则，形成"防火墙已开但数据库仍可从公网访问"的状态。不发布端口是与防火墙配置无关的可靠做法。
- **开机自启**：compose 服务声明 `restart: unless-stopped`，或配 systemd unit。
- **TLS**：certbot / Let's Encrypt 自动续期。
- **系统限制**：大项目可能需要调高 inotify watch 数与文件描述符上限。
- **备份**：`pg_dump` 定时任务 + 媒体卷备份 + **异地存放**，并按 §12 阶段 7 做恢复演练。
- **时区**：容器统一 UTC（与 §7.2 一致），展示层按站点时区转换。

**验收标准**：CI 从第一天起就在 Linux runner 上执行 `npm ci` + `build` + 测试。只要 CI 绿，迁移到 Ubuntu 即为配置工作，不涉及代码改动。

---

## 9. 主题与视觉

- next-themes **`attribute="class"`**（默认值）。

  > 关键坑：shadcn 在 Tailwind v4 下的暗色变体为 `@custom-variant dark (&:is(.dark *))`，走 `.dark` class 选择器。若改用 `attribute="data-theme"` 而不同步修改该 custom-variant，**所有 `dark:` 工具类会静默失效且不报错**。选择默认 class 方案以消除这一处偏离。

- 根节点 `suppressHydrationWarning`；主题脚本在 `<head>` 内联阻塞执行，首帧前完成，杜绝 FOUC。
- 颜色使用 **OKLCH** + shadcn 语义 token（`--background` / `--foreground` / `--card` / `--primary` / `--muted` / `--border` / `--ring` …），组件不写死颜色。
- 切换动画尊重 `prefers-reduced-motion`。
- `theme-color` meta 随手动切换动态同步。
- Shiki **服务端生成双主题 token**，客户端不重新高亮。
- 正文基于 Tailwind Typography，但覆盖代码块、表格、脚注、引用样式。
- 风格约束：正文 `max-width: 68ch`；灰阶（zinc）做层次；全站单一强调色；统一圆角；以 1px 边框替代阴影；无渐变装饰。

## 10. 权限

角色 `admin / editor / author` + 行级归属校验（author 仅能操作自己的文章）+ 审计日志 + 乐观锁。认证使用 Auth.js。

## 11. 搜索

PGroonga。选它而非 zhparser：zhparser 基于 SCWS，需维护词典、对新词与中英混排不友好；PGroonga 开箱支持多语言与中英混排，索引亦可加速 `LIKE`。

**明确不宣称**具备 Meilisearch 级别的排序质量（拼写容错、同义词、typo tolerance）。第一阶段定位为"可用的中文全文检索"；搜索需求复杂化后再评估切换专门引擎。

---

## 12. 交付顺序

1. **基础壳** —— 设计 token、主题、布局、文章详情视觉稿
2. **内容核心** —— schema、文章 CRUD、post_revisions、Markdown 渲染管线
3. **缓存契约** —— `'use cache'` 边界划分、标签词汇表、cacheLife profile、失效工具函数
4. **发布闭环** —— 预览、发布、定时发布、RSS、sitemap、canonical、JSON-LD
5. **后台能力** —— 编辑器、媒体库、存储适配、角色权限与审计
6. **用户能力** —— 搜索、评论、阅读量、点赞
7. **工程保障** —— 测试、CI/CD、备份恢复演练、监控、限流、CSP

阶段 3 前置于阶段 4：`cacheComponents` 开启后，标签边界是所有页面组件的写法前提，后补等于返工。

## 13. 明确排除项（v1 Non-goals）

- MDX
- 多实例 / K8s 部署与共享缓存
- CDN 页面缓存层
- 富文本 WYSIWYG 编辑器
- 专门搜索引擎（Meilisearch / OpenSearch）
- `output: 'export'` 静态导出（与数据库、Server Actions、认证、按需再生成不兼容）

## 14. 参考

- [Next.js 16](https://nextjs.org/blog/next-16)
- [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components)
- [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`cacheLife`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheLife)
- [`cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)
- [`revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [`updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag)
- [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)
- [PGroonga](https://supabase.com/docs/guides/database/extensions/pgroonga)
- [Tiptap Markdown](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap)
