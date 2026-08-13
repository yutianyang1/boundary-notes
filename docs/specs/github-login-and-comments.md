# Codex Spec：GitHub 登录 + 评论系统

## 背景与决策

评论**必须登录后才能发表**，这是既定决策。由此产生的连锁结果：

- 登录能力成为评论的前置条件，`accounts` 表（已存在，标准 next-auth 结构）终于要用上了。
- 第一个也是本次唯一的 OAuth 提供方是 **GitHub**：免费即时开通、不需要企业资质、国内可正常访问、技术读者匹配度高。
- **不接 Google**：授权页国内打不开，且服务端（腾讯云国内机房）访问不到 `oauth2.googleapis.com`，换 token 那步必然超时。整条链路不通，不是体验问题。
- **不开密码注册**：`PUBLIC_REGISTRATION_ENABLED` 继续为 `false`。它依赖 SMTP 发验证邮件，而发信链路正卡在腾讯云模板审核。等发信验证通过后把开关打开即可，**不属于本次范围**。

> 分工：本文交 Codex 实现，Claude 审查。涉及身份认证与公开写入，完成后**必须跑 `/security-review`**。

---

## 1. GitHub OAuth

### 1.1 配置

回调地址：`https://xiudou.site/api/auth/callback/github`

```
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
```

`.env.example` 补齐，**`docker-compose.yml` 的 `next` 服务必须透传**。漏透传就是生产上登录按钮点了没反应——`NEXT_PUBLIC_ICP_BEIAN` 那次已经踩过。

### 1.2 三条不能违反的安全约束

**（1）staff 角色禁止通过 OAuth 登录。**

`STAFF_MFA_ENFORCED` 对 staff 强制 MFA，而 OAuth 登录路径**完全绕过 MFA 校验**。如果某个 admin 的 GitHub 邮箱和站内账号一致，攻击者只要拿下他的 GitHub，就能跳过 MFA 直接进后台。

因此：OAuth 登录时若匹配到的用户 `role !== "reader"`，**拒绝登录**，提示改用密码 + MFA 登录。这条没有例外。

**（2）只有 GitHub 已验证的邮箱才允许关联到现有账号。**

GitHub 允许用户填未验证的邮箱。如果照单全收，攻击者在 GitHub 上填入受害者邮箱即可接管站内同邮箱账号。

必须请求 `user:email` scope，取**主邮箱且 `verified === true`** 的那个。拿不到已验证邮箱 → 拒绝登录，不要退化成"用 GitHub 用户名当邮箱"之类的兜底。

**（3）用户被禁用/软删时拒绝登录。**

和 `Credentials` 的 `authorize()` 一致：`disabledAt` 或 `deletedAt` 非空即拒绝（`auth.ts:50`）。别只在密码路径上做这个检查。

### 1.3 `auth.ts` 改动要点

现在的 `jwt` callback（`auth.ts:77-92`）依赖 `user.role` 和 `user.sessionVersion`，而这两个字段是 `Credentials.authorize()` 手工返回的。**OAuth provider 返回的 `user` 来自 GitHub profile，不含这两个字段**——直接加 provider 会让 `token.role` 变成 `undefined`，整套权限判断静默失效。

所以要在 `signIn` callback（或 GitHub provider 的 `profile()` 映射之后）完成：

1. 按已验证邮箱查 `users`。
2. **不存在** → 创建用户：`role: "reader"`、`emailVerifiedAt` 置当前时间（GitHub 已验证过）、`passwordHash` 留空、name/avatar 取自 profile。
3. **存在** → 跑 §1.2 的三条检查，通过则复用。
4. 写入 `accounts` 表：`provider: "github"`、`providerAccountId`、`type: "oauth"` 及 token 字段。该表主键是 `(provider, providerAccountId)`，重复登录用 `onConflictDoUpdate`。
5. 把 `role`、`sessionVersion`、`loginIp`、`loginUserAgent`、`loginDeviceName` 补进 user 对象，让 `jwt` callback 里 `createRegisteredSession` 那段逻辑**完全不用改**。

`session` callback、session registry、`sessionVersion` 踢下线机制**一律不动**。

> 是否引入 `DrizzleAdapter` 由实现者判断。当前是 JWT strategy + 自建 `userSessions` 注册表，adapter 的 session 管理是多余的；只为写 `accounts` 表而引入一整个 adapter，可能比手写那几行插入更麻烦。选哪种在 PR 里说明理由。

### 1.4 登录页

`/login` 增加「使用 GitHub 登录」按钮，和现有密码表单并列，中间一条 `或` 分隔。密码注册入口仍然隐藏（开关关着）。

---

## 2. 评论数据模型

`comments` 表当前是纯 guest 模型：`authorName`、`authorEmail` 均为 `notNull`，无 `userId`。改为：

- **新增 `userId`**：`uuid`，**可空**，`references(() => users.id, { onDelete: "set null" })`。
  - 发表时必填；置空只发生在用户注销之后，前端显示「已注销用户」。
  - **不要用 `cascade`**：删一个用户会连带删掉他在对话链中的那条评论，其他人的回复全部悬空，讨论上下文断裂。
- **删除 `authorName`、`authorEmail`**：展示时 join `users` 取 `name` 和头像。用户改名后历史评论跟着更新，符合直觉。
- **`status` 默认改为 `approved`**：登录制之后没必要每条进审核队列。字段保留，后台仍可标记 `spam`。
- **`ip`、`userAgent` 保留**：出事时能追溯。
- `parentId` + `depth` 已有，**限制 `depth <= 1`**（顶层 + 一层回复）。再深的嵌套在窄屏上无法阅读，且会诱发无限深的回复链。回复的回复一律挂在同一层。

迁移注意：表内如有历史 guest 数据（大概率为空，`COMMENTS_ENABLED` 一直是 `false` 且无 UI），迁移前确认，别让 `notNull` 的 `userId` 卡住迁移。

---

## 3. 评论功能

### 3.1 发表

Server Action，要求已登录（`requireUser()`）。

- 内容 zod 校验：trim 后 1–2000 字符。
- `depth`：有 `parentId` 时取父级 `depth + 1`，并校验 `<= 1`；父评论必须属于同一篇文章（**防止跨文章挂回复**）。
- 文章必须是已发布状态才能评论。
- **限流**：复用 `lib/subscribe/rate-limit.ts` 的 Redis + Lua 模式，按 `userId` 限制（例如每分钟 3 条、每小时 20 条）。登录不等于可以刷屏。
- 发表后 `revalidatePath` 该文章页。

### 3.2 内容渲染

**不要复用 `lib/markdown/render.ts`。** 那条管线带 KaTeX、Mermaid、Shiki，对评论是巨大的过度投入，性能也扛不住。

新建一条精简管线，白名单只放行：段落、换行、粗体、斜体、行内代码、代码块、引用、链接。

- **禁止**：图片、标题、原始 HTML、iframe。
- 链接一律加 `rel="nofollow ugc noopener"`、`target="_blank"`——这是用户生成内容，不能给出站权重，也不能被拿来做钓鱼跳板。
- 必须过 `rehype-sanitize`，白名单模式，不是黑名单。
- **存 markdown 原文**，渲染时处理。评论短，不必像 `posts` 那样存 `contentHtml`。

### 3.3 展示

- 顶层评论按时间倒序，**分页每页 20 条**；每条顶层评论的回复全量加载（受 depth<=1 约束，数量可控）。
- 只显示 `status = 'approved'`。
- 显示：头像、用户名、相对时间、内容。
- 未登录用户**能看评论**，发表框位置显示「登录后参与讨论」+ 登录入口。

### 3.4 删除

- 用户可删自己的评论。
- staff（`isStaffRole`）可删任意评论。
- **软删除**：置 `deletedAt`，显示为「该评论已删除」占位。有回复的评论若硬删，整条回复链会消失。
- 走审计日志，和 `post.delete` 一致（`comment.delete`）。

---

## 4. 前台 UI

评论区挂在文章页正文之后、`RelatedPosts` 之前（`app/(site)/posts/[slug]/page.tsx:246` 上方）。

- 用 `Suspense` 包裹，**不阻塞正文渲染**——评论查询不该拖慢首屏。
- 视觉跟随现有 token（`bg-card` / `border` / `rounded-[var(--radius-card)]`），不引入新样式变量。
- 表单用 `useActionState`，提交中禁用按钮，失败时原地提示。

## 5. 后台

`/admin/comments`：列表（文章、作者、内容摘要、时间、状态）、按状态筛选、标记 spam、删除。

权限：`editor` 和 `admin` 可见，`author` 不可见。评论是全站资产，参照 `/admin/subscribers` 的处理。

## 6. 开关

`COMMENTS_ENABLED` 已存在于 `lib/features.ts`，但 `areCommentsEnabled()` **目前全项目零调用**。本次要真正接上：关闭时评论区不渲染、发表 action 直接返回、后台入口隐藏。

`docker-compose.yml` 里 `COMMENTS_ENABLED` 已透传，无需新增。

---

## 7. 测试

- **OAuth 安全三条**：staff 走 OAuth 被拒；GitHub 邮箱未验证被拒；`disabledAt`/`deletedAt` 用户被拒。这三条是本次最重要的测试。
- 新用户经 OAuth 创建时 `role === "reader"`。
- `accounts` 表重复登录走 `onConflictDoUpdate`，不产生重复行。
- 评论 `depth` 校验：深度超限被拒；`parentId` 指向其他文章的评论被拒。
- 渲染管线：`<script>`、`<img>`、原始 HTML 被剥离；链接带 `nofollow ugc`。
- 限流：超过阈值后拒绝。
- 权限：非作者非 staff 删他人评论被拒。
- `npm run check` 全绿。

## 8. 验收清单

- [ ] GitHub 登录跑通，新用户自动建号且 `role = reader`。
- [ ] **staff 账号无法通过 GitHub 登录**（最关键一条）。
- [ ] GitHub 未验证邮箱无法关联到已有账号。
- [ ] 登录后可评论，未登录只能看。
- [ ] 二级回复正常，三级被拒。
- [ ] 评论内容里的 `<script>`、`<img>` 被剥离；链接带 `nofollow ugc noopener`。
- [ ] 删除评论后显示占位，回复链不断。
- [ ] `COMMENTS_ENABLED=false` 时评论区完全消失。
- [ ] `.env.example` 与 `docker-compose.yml` 已补 `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`。
- [ ] 跑完 `/security-review` 无未处理高危项。

## 9. 实现顺序

1. GitHub provider + `signIn` callback 的三条安全检查 + `accounts` 写入
2. 登录页按钮
3. `comments` 表迁移
4. 评论渲染管线（**独立可测，先做**）
5. 发表 / 删除 action + 限流
6. 前台评论区
7. 后台管理页

第 1 步单独提交。它改的是认证核心，混进评论功能里会让审查变得困难。

---

## 附：不做

- Google / 微信 / Gitee 登录（理由见开头）
- 密码注册（一个开关的事，等 SMTP 验证通过）
- 评论点赞、@提及、邮件通知回复
- 评论的 markdown 预览
