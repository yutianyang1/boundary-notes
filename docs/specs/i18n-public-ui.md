# 前台 UI 双语(zh / en)

状态:**已完成并上线**(全部五个阶段)
最后更新:2026-08-14

> 本文前半部分是实施前的设计,保留原样以便追溯当时的判断;
> 第 11 节起记录实际落地情况,第 14 节记录踩过的坑。
> 设计与实现有出入的地方已就地标注。

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
- Next.js App Router 不再提供内置 i18n 路由(那是 Pages Router 时代的 `next.config.i18n`),必须自建。
  **更正**:本仓库根目录已有 `proxy.ts`——Next.js 16 把 `middleware.ts` 改名为 `proxy.ts`,中间件其实是存在的。它承担两件事:注册关闭时对 `/register`、`/verify-email` 返回 404;设置 `x-current-path` 供后台守卫构造 callbackUrl。i18n 路由必须**接进这个文件**,不能新建 `middleware.ts` 覆盖它。
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

**兼容性已验证**(2026-08-13,next-intl 4.13.6):

- peer deps 明确声明 `next: ^16.0.0`、`react: ^19.0.0`。
- Webpack 生产构建通过。
- **与 `cacheComponents: true` 共存**:配合 `generateStaticParams` + `setRequestLocale`,`/zh` 与 `/en` 两套路由都保持 `◐ Partial Prerender`,没有退化成动态渲染。这是本项目最需要确认的一点,因为 `next.config.ts` 开着 Cache Components。

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

> **实际采用 C,已上线。** 15 个中文 slug 全部迁为英文,旧地址由 `proxy.ts` 301 到新地址(保留 locale 前缀与查询参数)。
> 没有新建重定向表:这是一次性重命名,映射此后不再变化,而分类/标签没有后台改名入口。
> 映射写在 `lib/posts/slug-redirects.ts`,迁移脚本读同一份数据,301 与改名因此不会走偏。

## 9. 语言切换与检测

- 顶栏放语言切换器,挨着主题切换按钮;切换时**保持当前路径**。
- 选择写入 `NEXT_LOCALE` cookie。
- **不做基于 `Accept-Language` 的自动跳转**。自动跳转会让爬虫拿到非预期语言的页面、让分享出去的链接在不同人那里显示不同语言,收益不抵麻烦。语言只由 URL 前缀和显式切换决定。

## 10. SEO

- 每个页面 `<head>` 输出双向 `hreflang` alternate,外加 `x-default` 指向中文。
- `<html lang>` 跟随当前 locale。
- `sitemap.xml` 同时输出两个 locale 的 URL。
  > **更正**:「sitemap 漏掉 `/categories` 和 `/series`」的说法来自对着**线上旧构建**做的 QA,工作区当时早已包含它们。此处无需修复。
- **RSS 保持单一中文源**。内容本身是中文,出英文 feed 没有意义。

## 11. 实际落地

五个阶段全部完成并部署到生产。

| 阶段 | 内容 | 状态 |
|---|---|---|
| 一 | next-intl 接入、i18n 路由接进 `proxy.ts`、路由移入 `[locale]/` | ✅ 已上线 |
| 二 | 前台 UI 双语,**411 条字典**(计划估的是 367 条) | ✅ 已上线 |
| 三 | 分类/标签/系列英文名(`name_en` 回退) | ✅ 已上线 |
| 四 | hreflang + 双语 sitemap | ✅ 已上线 |
| 后续 | 中文 slug 迁移 + 301 | ✅ 已上线 |

### 与设计的偏差

**字典 411 条 vs 估算 367 条。** 估算按「字符串字面量 + JSX 裸文本」数,漏掉了 `aria-label`、`alt`、`placeholder`、`metadata` 里的文案,以及服务端动作的报错。

**服务端动作返回字典 key 而非文案。** 设计里写的是「动作返回的文案也走字典」,实际做法是动作返回 `"errors.resendCooldown"` 这样的 key,由表单在渲染时翻译。原因:动作自己没有 locale,要拿到就得再读一次请求状态,而那正是 `cacheComponents` 禁止的。副作用是动作更好测——断言返回的 key 是在测行为,断言返回的句子是在测文案。

**查询层同时取中英两列,不在 SQL 里按 locale 取值。** 设计里没写这一层。这样做的好处是查询结果与语言无关,`cacheComponents` 下两种语言共用同一份缓存,而不是各缓存一份。

**服务端组件用原生 `next/link` 加 `localePath()`,不用 next-intl 的 `<Link>`。** 原因见第 14 节。

### 生产验证(2026-08-14)

| 项 | 结果 |
|---|---|
| 中文 URL | `/`、`/posts`、`/about` 等 200,**无重定向,地址未变** |
| 英文 URL | `/en/*` 全部 200 |
| `/zh/posts` | 307 → `/posts` |
| 旧中文标签地址 | 301 → 英文 slug,保留 `/en` 前缀与查询参数 |
| `/en/tags`、`/en/categories` | 纯英文名,零中文 |
| `/tags`、`/categories` | 纯中文名,零英文 |
| `/en/posts/<slug>` | `<html lang="en">` + 正文 `lang="zh-CN"` |
| hreflang | 每页三条 alternate,双向对称,`x-default` 指向中文 |
| sitemap | 86 条 URL(两个 locale 各 43),258 条 `xhtml:link`,中文 slug 归零 |
| 全站回归 | 17 条路径零异常,含 `/admin`、`/feed.xml`、`/robots.txt` |

## 12. 风险(回顾)

| 计划中的风险 | 实际情况 |
|---|---|
| 大 diff | 如预期。路由移动单独成一个提交,不掺文案改动 |
| 链接遗漏 | **真实发生**。`npm run lint` 的「导入未使用」警告牵出标签页链接没加前缀;全量审计又查出 8 处服务端组件同样问题,其中 `PostCard` / `FeaturedPost` 影响最大——它们在首页和所有列表页,英文站每张卡片点进去都掉回中文站 |
| 认证重定向 | 如预期,逐一处理 |
| 生产落后于工作区 | 如预期。先部署既有改动,再开始 i18n |

**计划外的风险**:`cacheComponents` 与 next-intl 服务端 API 的冲突,见下节。这是整个项目里最耗时的部分。

## 13. 验收

- [x] 所有现有中文 URL 保持可访问,响应内容不变
- [x] `/en` 下公开页面无中文残留(文章标题/正文、品牌名除外)
- [x] 语言切换保持当前路径
- [x] 中英文 hreflang 互指且各自 canonical 正确
- [x] `npm run check` 通过(126 个测试)
- [x] `/admin`、`/api`、`/internal`、RSS 行为不受影响

## 14. 实施记录:cacheComponents 的坑

本项目 `next.config.ts` 开着 `cacheComponents: true`。next-intl 的服务端 API 大多会触碰请求上下文,在这个模式下会被判为「未缓存数据访问」。**顶栏和页脚位于布局链上,外面包 `<Suspense>` 救不回来**——这一点最反直觉,排查时先试的就是这条,白费一轮。

按发现顺序:

1. **`getTranslations()` 不带 locale 会回落到读 `headers()`。** 解法:locale 从 `params` 显式取,再显式传下去。
2. **就算显式传了 locale,`getTranslations()` 仍要 await 请求配置。** 解法:换成 `createTranslator()`,它是纯函数,不碰请求上下文。
3. **用模板字面量做动态 `import()` 加载字典,没法被 `"use cache"` 缓存**——模板字面量不可静态分析。解法:字典就几 KB,改成静态导入 + 同步查表,顶栏页脚一个 `await` 都不剩。
4. **next-intl 的 `<Link>` 在服务端渲染时会从请求上下文取 locale。** 解法:服务端组件改用原生 `next/link` 配 `localePath()` helper;客户端组件继续用 next-intl 的 `<Link>`,它们从 Provider 拿 locale,没这问题。
5. **`LanguageToggle` 确实需要当前路径**,这个躲不掉。解法:给它自己包一层 `<Suspense>`。

前四条是逐个排除掉的嫌疑,第五条才是真凶。

**结论**:在 `cacheComponents` 下,静态外壳里的翻译要走「静态导入字典 + `createTranslator` + 显式 locale」这条全同步路径。任何 `await` 都会让组件退出静态外壳。

`--debug-prerender` 是排查这类问题的关键——默认的生产构建错误信息里没有组件堆栈。

## 15. 已知限制

- **`/en` 的 404 正文仍是中文。** `not-found.tsx` 拿不到路由参数,而 `getTranslations()` 和 `headers()` 在那里都会抛错、让响应变成 **500**(两条路都实测过,发现后已回退)。`<html lang>` 仍然正确。要真正修好得等 Next 的 `global-not-found` 从 experimental 转正。
- **文章正文、后台、邮件模板保持中文**,这是第 2 节的非目标,不是遗漏。
- **品牌名「边界笔记」不翻译**,它是品牌不是文案。

## 16. 关联改动

实施过程中发现并修复的、不属于本方案范围的问题:

- **`post_redirects` 只写不读。** 文章改 slug 时会往表里插记录,但没有任何地方查它,旧地址直接 404。已接线,返回 308(`permanentRedirect` 在 Next.js 里的规范值)。
- **`localePath("/", "en")` 产出 `/en/`**,而实际路由是 `/en`。在链接里无害,在 canonical 和 sitemap 里就是两个不同地址。已修并加测试。
- **字典同步测试**。四条不变量:key 集合一致、无空文案、占位符与富文本标签匹配、英文文件无残留中文。到目前为止拦下过三次真实错误,其中两次是 ICU 复数语法把测试自己的解析器打穿。
