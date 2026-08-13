# 前台 UI 双语(zh / en)

状态:草案,未实施
最后更新:2026-08-13

## 1. 目标

让不懂中文的访客能够**导航**这个站点:菜单、按钮、表单、报错、空状态、元信息全部可切换为英文。

## 2. 非目标(明确不做)

以下内容保持中文,不在本次范围内:

- **文章正文、标题、摘要** —— 10 篇中文技术长文。机翻会毁掉技术表达,人工翻译是写作工作量而非工程工作量。
- **后台 `app/admin`** —— 只有站点作者使用,19 个文件、约 150 条字符串,没有双语需求。
- **邮件模板** —— 5 个模板,其中腾讯云 SES 那几个带审核模板 ID。英文版意味着 5 个新模板重新过审,而当前还有 3 个模板卡在审核中。
- **审计日志、后台错误** —— 面向运维,非公开。

**必须清楚的预期**:做完之后,英文 UI 里的文章卡片仍然显示中文标题。这是刻意的取舍,不是缺陷。本方案交付的是「中文内容站的英文外壳」,让英文访客看得懂结构、走得通注册登录,而不是一个英文内容站。

## 3. 现状测量

2026-08-13 实测:

| 范围 | 字符串字面量 | JSX 裸文本 | 文件数 |
|---|---:|---:|---:|
| `app/(site)` | 137 | 40 | 22 |
| `app/(auth)` | 84 | 53 | 19 |
| `components/article` | 14 | 1 | 7 |
| `components/about` | 6 | 1 | — |
| `components/subscribe` | 2 | 3 | — |
| `site-footer.tsx` | 9 | 0 | 1 |
| `mobile-nav.tsx` | 7 | 1 | 1 |
| `site-header.tsx` | 3 | 1 | 1 |
| `components/browse` / `auth` / `theme-toggle` | 5 | 0 | 5 |
| **合计** | **约 367 条,约 55 个文件** | | |

其他事实:

- `package.json` 中**没有任何 i18n 依赖**。
- **没有 `middleware.ts`**。Next.js App Router 不再提供内置 i18n 路由(那是 Pages Router 时代的 `next.config.i18n`),必须自建。
- 公开路由 `page.tsx` 共 22 个。
- 需要改为 locale 感知的内部 `href="/..."` 共 23 处。

## 4. 硬约束:不得改动现有中文 URL

站点已上线,sitemap 已提交,RSS 有订阅者,站外可能已有入链。**`/posts/flash-attention` 必须继续在原地址可访问**,不能变成 `/zh/posts/flash-attention`。

因此采用**默认语言不带前缀**的策略:

```
/posts/flash-attention        -> 中文(默认,URL 不变)
/en/posts/flash-attention     -> 英文
```

即 next-intl 的 `localePrefix: "as-needed"`。

## 5. 库选型

**推荐 `next-intl`**,理由:服务端组件和客户端组件都支持、自带满足第 4 节要求的路由中间件、ICU 消息格式(复数/插值)、提供 locale 感知的 `<Link>` 和 `redirect`。

**实施前必须先验证**:`next-intl` 对 Next.js 16.2 + React 19.2 的兼容性。本项目生产构建固定走 Webpack(见 README),新依赖需要确认不破坏 standalone 产物的 Windows → Linux 跨平台构建。若不兼容,退路是手写一个最小方案(约 150 行:消息加载 + `t()` + 中间件),代价是失去 ICU 和现成的 `<Link>`。

## 6. 路由结构

```
app/
  [locale]/
    (site)/          <- 从 app/(site) 整体移入
    (auth)/          <- 从 app/(auth) 整体移入
  admin/             <- 不动,不带 locale
  api/               <- 不动
  internal/          <- 不动
  media/             <- 不动
```

`middleware.ts` 负责:

- `/posts/x` → 内部改写为 `/zh/posts/x`,浏览器地址栏保持 `/posts/x`
- `/en/posts/x` → 保持 `/en` 前缀
- `matcher` 必须排除 `/admin`、`/api`、`/internal`、`/media`、`/_next`、`/feed.xml`、`/sitemap.xml`、`/robots.txt`

**风险**:把 41 个路由文件移入 `[locale]/` 是一个大 diff,所有相对 import 路径都会变。建议这一步单独成一个提交,且不掺杂任何文案改动,便于 review 和回滚。

## 7. 消息目录

```
messages/
  zh.json
  en.json
```

按区域分命名空间,与路由结构对齐:

```
common     通用按钮、状态、分页
nav        顶栏、移动端菜单、页脚
home       首页
post       文章页(目录、阅读进度、分享、相关文章)
archive    列表、分类、标签、系列、搜索
auth       登录、注册、验证邮箱、找回密码、MFA
comments   评论区
errors     404、表单校验、服务端动作返回的报错
```

**服务端动作返回的文案**(如 `app/(auth)/register/actions.ts` 里的「验证邮件刚刚发送过,请 N 秒后再试。」)也要走字典。这类文案带插值,是选用 ICU 格式的主要理由。

## 8. 数据库内容

分类、标签、系列的**显示名**存在库里,是中文单值列:

| 表 | 字段 |
|---|---|
| `categories` | `name`、`description` |
| `tags` | `name` |
| `series` | `name`、`description` |

**方案**:给这三张表加 nullable 的 `name_en` / `description_en` 列,取值时 `name_en ?? name` 回退。三张表一次迁移,不引入 join,比建通用翻译表简单得多——只有 3 个实体类型,不值得为扩展性付出复杂度。

后台需要在分类/标签/系列的编辑表单上加对应的英文字段(这是本方案里唯一会碰 `app/admin` 的地方)。

### 8.1 已知问题:标签 slug 有中文

实测 27 条分类/标签/系列 URL 中,**15 条 slug 是中文**:推理优化、语音识别、大模型、实时音频、归一化、数字人、残差连接、注意力机制、深度学习、深度网络、热词、稀疏模型、系统架构、线性注意力、长上下文。另 12 条是英文。

于是英文站会出现 `/en/tags/推理优化` 这种不自洽的地址。

三个选项:

| | 做法 | 代价 |
|---|---|---|
| A | 保持现状,英文站也用中文 slug | 零风险,但 URL 难看 |
| B | 加 `slug_en`,英文站用另一套 slug | 同一实体两个 URL,需处理 canonical |
| C | 全部迁移为英文 slug + 旧地址 301 | 最干净,但需要为 taxonomy 建重定向表(`post_redirects` 只覆盖文章) |

**建议**:阶段一到三先用 A,把 slug 迁移(C)作为独立任务排后面。理由是 slug 迁移会动到已发布 URL,属于第 4 节的硬约束范围,不应该和 i18n 混在一个变更里。

## 9. 语言切换与检测

- 顶栏放语言切换器,挨着主题切换按钮;切换时**保持当前路径**。
- 选择写入 `NEXT_LOCALE` cookie。
- **不做基于 `Accept-Language` 的自动跳转**。自动跳转会让爬虫拿到非预期语言的页面、让分享出去的链接在不同人那里显示不同语言,收益不抵麻烦。语言只由 URL 前缀和显式切换决定。

## 10. SEO

- 每个页面 `<head>` 输出双向 `hreflang` alternate,外加 `x-default` 指向中文。
- `<html lang>` 跟随当前 locale。
- `sitemap.xml` 同时输出两个 locale 的 URL(顺带修掉当前 sitemap 漏掉 `/categories` 和 `/series` 的问题)。
- **RSS 保持单一中文源**。内容本身是中文,出英文 feed 没有意义。

## 11. 分期落地

**阶段一 —— 基础设施(不改任何文案)**
接入 next-intl、写 middleware、路由移入 `[locale]/`、抽出 `zh.json`,`en.json` 先原样复制中文。
*完成标志:站点行为与现在完全一致,所有现有 URL 不变。这一阶段可以安全上线。*

**阶段二 —— 英文字典**
翻译 367 条字符串,`/en` 正式可用。
*完成标志:英文站可完整走通浏览、搜索、注册、登录、找回密码。*

**阶段三 —— 数据库显示名**
三张表加 `_en` 列 + 迁移 + 后台编辑字段。

**阶段四 —— SEO**
hreflang、双语 sitemap。

**后续独立任务** —— taxonomy slug 迁移(第 8.1 节方案 C)。

## 12. 风险

- **大 diff**:41 个路由文件移动 + 55 个文件的文案替换。必须拆成多个提交。
- **链接遗漏**:23 处硬编码 `href` 若漏改,英文站点击后会掉回中文站。建议加一条 lint 规则或测试,禁止在 `[locale]` 下直接使用 `next/link`。
- **认证重定向**:`auth.ts` 的 `pages.signIn: "/login"`、各处守卫的 `redirect("/login")`、`safeLocalRedirect` 默认值 `/account` 都不是 locale 感知的,需逐一处理。
- **生产落后于工作区**:当前线上跑的构建旧于本仓库(例如 `/reset-password` 不带 token 时线上仍渲染完整表单,而本地已有「链接无效」分支)。**在部署这些既有改动之前不要开始 i18n**,否则一次上线会同时引入两批未验证的变更。

## 13. 验收

- [ ] 所有现有中文 URL 保持可访问,响应内容不变
- [ ] `/en` 下 22 个公开页面无中文残留(文章标题/正文除外)
- [ ] 语言切换保持当前路径
- [ ] 中英文 hreflang 互指且各自 canonical 正确
- [ ] `npm run check` 通过
- [ ] `/admin`、`/api`、`/internal`、RSS 行为不受影响
