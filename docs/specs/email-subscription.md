# Codex Spec：邮件订阅（double opt-in + 新文章推送）

> 投递容量说明：当前 worker 每分钟处理 10 封邮件，1,000 位订阅者约需 100 分钟完成投递。SMTP 服务商的每日配额与速率上限尚未确认，上线群发前必须按实际服务商套餐核验。

## 背景

`mail_outbox` 表、`lib/mail/worker.ts`、`infra/scheduler/crontab` 里每分钟打 `/internal/jobs/send-mail` 的 cron —— 整条投递链路已经是活的，注册验证邮件正在走它。这次要做的不是搭邮件系统，是**在既有链路上接一个订阅者列表**。

前置条件已满足：域名 `xiudou.site` 已备案并上线，`AUTH_URL` / `NEXT_PUBLIC_SITE_URL` 已指向正式域名。此前这两个值是 `http://localhost`，确认链接和退订链接发出去都是死链，功能不成立。

> 分工：本文交 Codex 实现，Claude 审查。涉及 token、公开表单、群发邮件，实现完成后**必须跑 `/security-review`**。

---

## 1. 范围

**做**：邮箱订阅表单（无需注册账号）、double opt-in 确认、文章发布时推送、一键退订、后台订阅者列表。

**不做**（本次范围外）：
- 邮件模板的 HTML 排版系统（沿用 `worker.ts` 里 `render()` 的字符串拼接风格）
- 订阅分类/标签（只做全站订阅）
- 摘要邮件（weekly digest）
- 与 `users` 表打通（登录用户单独订阅，两套互不影响）

---

## 2. 数据模型

### 2.1 新表 `subscribers`

```ts
export const subscriberStatus = pgEnum("subscriber_status", ["pending", "confirmed", "unsubscribed"]);

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  status: subscriberStatus("status").notNull().default("pending"),
  confirmTokenDigest: varchar("confirm_token_digest", { length: 64 }),
  confirmTokenExpiresAt: timestamp("confirm_token_expires_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("subscribers_email_unique").on(table.email),
  uniqueIndex("subscribers_confirm_token_unique").on(table.confirmTokenDigest),
  index("subscribers_status_idx").on(table.status),
]);
```

要点：
- **邮箱归一化后存储**：`email.trim().toLowerCase()`，唯一索引才有意义。
- `confirmTokenDigest` 沿用 `lib/auth/action-tokens.ts` 的 `createActionToken()` / `digestActionToken()`——**只存 sha256 digest，不存明文**，和 `user_action_tokens` 完全同构。
- **退订不删行**，置 `status = 'unsubscribed'` + `unsubscribedAt`。删掉的话对方下次会被重新加回来，等于无视了退订意愿。
- 不复用 `user_action_tokens`：那张表 `user_id` 是 `notNull` 且 FK 到 `users`，订阅者没有账号。

### 2.2 新表 `post_broadcasts`（防重复推送）

```ts
export const postBroadcasts = pgTable("post_broadcasts", {
  postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  broadcastAt: timestamp("broadcast_at", { withTimezone: true }).notNull().defaultNow(),
  recipientCount: integer("recipient_count").notNull().default(0),
});
```

**这张表是整个功能里最关键的一张。** 没有它，作者把一篇已发布的文章改个错别字再保存，全部订阅者会被再推一次。主键即 `postId`，插入冲突就是"已推过"，用 `onConflictDoNothing` 天然幂等。

---

## 3. 退订链接：用 HMAC 派生，不入库

退订链接必须出现在**每一封**推送邮件里，所以需要一个长期有效、可随时重算的 token。存明文入库不可接受（库泄露即可代他人退订），存 digest 又没法反推出链接。

解法是从服务端密钥派生：

```ts
// lib/subscribe/tokens.ts
export function unsubscribeToken(subscriberId: string) {
  return createHmac("sha256", secret()).update(subscriberId).digest("base64url");
}
export function verifyUnsubscribeToken(subscriberId: string, token: string) {
  const expected = unsubscribeToken(subscriberId);
  const a = Buffer.from(expected), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);   // 必须常量时间比较
}
```

- 密钥用新环境变量 `SUBSCRIBE_TOKEN_SECRET`（base64，32 字节），**不要复用 `AUTH_SECRET`**——密钥用途要单一，将来轮换互不牵连。
- 退订链接形如 `/unsubscribe?id=<uuid>&token=<hmac>`。
- 校验必须用 `timingSafeEqual`，不要用 `===`。参照 `app/internal/jobs/publish-scheduled/route.ts` 里的写法，不要参照 `send-mail/route.ts`（那个是 `!==` 直接比，本身就是待修的欠账）。

---

## 4. 流程

### 4.1 订阅（`POST` Server Action）

1. zod 校验邮箱格式；归一化 `trim().toLowerCase()`。
2. 查 `subscribers`：
   - 不存在 → 插入 `pending` + 新 confirm token（24h 过期）+ 入队 `subscribe_confirm` 邮件。
   - 已存在且 `confirmed` → **什么都不做**。
   - 已存在且 `pending` → 重新签发 token 并重发（但受 4.4 限流约束）。
   - 已存在且 `unsubscribed` → 允许重新订阅，回到 `pending` 并重发确认。
3. **无论走哪个分支，一律返回同一句话**：「如果该邮箱可用，确认邮件将会发送」。

第 3 点是硬性要求。返回「你已订阅过了」等于把这个表变成邮箱枚举接口。`app/(auth)/register/actions.ts:25-28` 已经是这个写法，照抄它的处理方式。

### 4.2 确认（`GET /subscribe/confirm?token=...`）

1. `digestActionToken(token)` 查表。
2. 校验 `confirmTokenExpiresAt > now()` 且 `status = 'pending'`。
3. 通过 → `status = 'confirmed'`、`confirmedAt = now()`、**清空 `confirmTokenDigest` 和 `confirmTokenExpiresAt`**（一次性）。
4. 失败 → 渲染一个中性的失败页（「链接无效或已过期」），不要区分「不存在」和「已过期」。

### 4.3 退订（`GET /unsubscribe?id=&token=`）

1. 验 HMAC（常量时间）。
2. 通过 → `status = 'unsubscribed'`、`unsubscribedAt = now()`。**幂等**：已退订的再点一次也返回成功页，不报错。
3. 页面上给一个「重新订阅」的入口，误点了能回来。

> 注意不要做成 `POST` 才能退订。部分邮件客户端会预取链接，但**退订被预取执行是可接受的**（用户本来就有权退订），而要求用户额外点一次按钮反而增加摩擦、拉高投诉率。

### 4.4 限流

订阅表单是**无需登录的公开写接口**，必须限流，否则会被拿来当邮件轰炸机（往任意邮箱发确认邮件）。项目已有 `lib/redis.ts`，用它：

- 同一 IP：每小时最多 5 次提交。
- 同一邮箱：每小时最多 1 封确认邮件（不管提交多少次）。

超限时**依然返回那句统一文案**，不要返回 429 —— 否则又成了探测接口。

---

## 5. 发布时推送

### 5.1 两个触发点，都要接

1. `app/admin/posts/actions.ts` —— 手动把状态改成 `published`
2. `app/internal/jobs/publish-scheduled/route.ts` —— cron 把 `scheduled` 转 `published`

**两个都要接，漏一个就是"定时发布的文章没人收到通知"。**

### 5.2 入队逻辑

抽成一个共用函数 `enqueuePostBroadcast(tx, postId)`：

```
1. insert into post_broadcasts (post_id) values ($1) on conflict do nothing returning post_id
2. 若没有 returning 行 → 已推送过，直接返回 0
3. select id, email from subscribers where status = 'confirmed'
4. 为每个订阅者构造 payload（含 postTitle / postUrl / postSummary / unsubscribeUrl），
   批量 insert 进 mail_outbox，template = 'post_published'
5. update post_broadcasts set recipient_count = N
```

要求：
- 全程在**调用方的事务里**（`tx`），和文章状态变更同一个事务。推送入队失败就回滚发布，不允许出现"发布了但没入队"或"入队了但没发布"。
- 第 4 步分批插入，每批 500 行，避免单条 SQL 参数过多。
- `encryptionKeyVersion: 1`（和 `register/actions.ts:53` 一致）。
- **退订链接逐人不同**（HMAC 里有各自的 subscriberId），不能所有人共用一条。

### 5.3 已知瓶颈，必须在 PR 里说明

`processMailOutbox(limit = 10)`，`send-mail` 路由调用时没传参数，cron 每分钟一次 —— **当前吞吐上限是每分钟 10 封**。1000 个订阅者要 100 分钟才发完。

本次**不改这个默认值**，但要：
- 在 `docs/specs/` 或 PR 描述里写明这个数字和推算；
- 确认 SMTP 服务商的每日配额和速率限制（这个我不知道你用的哪家，需要你自己查），如果配额低于订阅者数量，群发会中途开始失败并进入重试；
- 后续要提速，是调 `processMailOutbox` 的 limit 或加密 cron 频率，不是改这次的代码结构。

---

## 6. 邮件模板

`lib/mail/worker.ts` 的 `render()` 目前只认 `verify_email`，其余一律 `throw new Error("Unknown mail template")`。**新增两个 case，不加就是入队即失败**：

**`subscribe_confirm`** — payload: `{ confirmUrl }`
- 主题：「确认订阅边界笔记」
- 正文：一句说明 + 确认链接 + 「链接 24 小时内有效」+「如果你没有订阅过，忽略这封邮件即可」

**`post_published`** — payload: `{ postTitle, postSummary, postUrl, unsubscribeUrl }`
- 主题：文章标题
- 正文：摘要 + 阅读全文链接 + **页脚退订链接**

两个模板都必须：
- 用现成的 `escapeHtml()` 转义所有插值（`worker.ts:41`）；
- 同时提供 `text` 和 `html` 两个版本，和 `verify_email` 保持一致。

**`post_published` 还要带 `List-Unsubscribe` 头**，否则大概率进垃圾箱：

```ts
headers: {
  "List-Unsubscribe": `<${unsubscribeUrl}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
}
```

`render()` 现在只返回 `{ subject, text, html }`，需要扩成可选返回 `headers`，并在 `sendMail` 调用处透传（`worker.ts:78`）。

---

## 7. 前台 UI

- **订阅表单组件**：放文章页底部 + 首页侧栏。一个输入框 + 按钮，提交后原地显示统一文案，不跳页。
- **`/subscribe/confirm`**、**`/unsubscribe`**：两个极简结果页，复用 `PageHeader` 的排版风格。
- 视觉上跟着现有 token 走（`bg-card` / `border` / `rounded-[var(--radius-card)]`），不要引入新样式变量。

## 8. 后台

`/admin/subscribers`：列表（邮箱、状态、订阅时间）、按状态筛选、总数统计。**只读**，本次不做后台手动增删——手动加订阅者绕过了 double opt-in，是合规风险。

权限：`editor` 和 `admin` 可见，`author` 不可见（订阅者邮箱是全站资产，不是作者个人资产）。参照 `lib/auth/permissions.ts` 的现有写法。

## 9. 开关

沿用 `lib/features.ts` 的模式加一个：

```ts
export const isSubscriptionEnabled = () => enabled("SUBSCRIPTIONS_ENABLED");
```

关闭时：前台表单不渲染、订阅 action 直接返回、发布时不入队。`docker-compose.yml` 的 `next` 服务要透传 `SUBSCRIPTIONS_ENABLED` 和 `SUBSCRIBE_TOKEN_SECRET`，`.env.example` 补上——**这两个漏了就是功能在生产静默失效**，参照之前 `NEXT_PUBLIC_ICP_BEIAN` 那次。

---

## 10. 测试

- `lib/subscribe/tokens.test.ts`：HMAC 生成稳定、篡改 token 验证失败、长度不等时不抛异常。
- 邮箱归一化：`" Foo@Bar.COM "` → `foo@bar.com`。
- 状态机：pending → confirmed；confirmed 再订阅不重发；unsubscribed 可重新订阅。
- 确认 token：过期拒绝、消费后置空、重复使用失败。
- `enqueuePostBroadcast`：同一 postId 调两次，第二次入队 0 封（幂等）。
- `render()`：两个新模板都能渲染；未知模板仍然抛错。
- `npm run typecheck`、`npm run test`、`npm run lint` 全绿。

## 11. 验收清单

- [ ] 订阅 → 收到确认邮件 → 点击 → 状态变 confirmed。
- [ ] 未确认的订阅者**收不到**文章推送。
- [ ] 发布文章 → confirmed 订阅者收到邮件，标题/链接/摘要正确，链接是 `https://xiudou.site/...` 不是 localhost。
- [ ] 定时发布的文章同样触发推送。
- [ ] 同一篇文章重新保存/编辑，**不产生第二次推送**。
- [ ] 每封推送邮件都有可用的退订链接，且各人不同；点击后立即退订，再点不报错。
- [ ] 已订阅邮箱重复提交，返回文案与新邮箱完全一致（无法区分）。
- [ ] 限流生效：同一 IP 连续提交第 6 次不再发信，但文案不变。
- [ ] `SUBSCRIPTIONS_ENABLED=false` 时前台表单消失、发布不入队。
- [ ] 跑完 `/security-review` 无未处理高危项。

## 12. 实现顺序建议

1. schema + migration（`npm run db:generate`）
2. `lib/subscribe/tokens.ts` + 测试
3. 订阅/确认/退订三条路径 + 限流
4. `worker.ts` 两个模板 + `headers` 透传
5. `enqueuePostBroadcast` + 挂到两个发布触发点
6. 前台表单 + 结果页
7. 后台列表
8. `.env.example` / `docker-compose.yml` 透传

第 5 步是最容易出错的一步（事务边界 + 幂等 + 两个触发点），建议单独提交，方便审查。
