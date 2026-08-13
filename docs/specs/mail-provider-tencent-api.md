# Codex Spec：发信通道改造（SMTP → 腾讯云邮件推送 API）

> 官方文档核对结果（2026-08-04）：采用产品子包 `tencentcloud-sdk-nodejs-ses`；`SendEmail` 仅支持 `ap-guangzhou` / `ap-hongkong`；模板变量写作 `{{变量名}}`；接口支持 JSON 字符串形式的 `SmtpHeaders`，因此现有 `List-Unsubscribe` 与 One-Click 头可以保留。`Unsubscribe` 参数是腾讯云自带退订链接语言开关，本项目继续以本地 subscribers 为唯一事实来源，故设为 `0`。

## 背景

腾讯云邮件推送对**个人实名认证用户不开放 SMTP 发信**，只能走 API 或控制台。`lib/mail/worker.ts` 目前是 nodemailer + SMTP，在生产环境跑不通。

要改的只有**发送那一步**。`mail_outbox` 的排队、认领（`FOR UPDATE SKIP LOCKED`）、重试退避、发送后抹除 payload、`safeError` 脱敏——这些全部保留，一行不动。

> 分工：本文交 Codex 实现，Claude 审查。涉及第三方凭据和发信，完成后**必须跑 `/security-review`**。

---

## 0. 实现前必须先查文档确认的四件事

这几项我没有实测过，**动手前先查官方文档，与本文冲突时以文档为准**，并在 PR 里说明实际情况：

1. **SDK 包名**：是装总包 `tencentcloud-sdk-nodejs` 还是按产品拆分的子包。总包体积很大，能用子包就用子包。
2. **`Region` 的合法取值**：国内站邮件推送支持哪些地域，控制台里能看到。
3. **模板变量语法**：控制台模板里引用变量的写法（`{{name}}` 之类），决定 `TemplateData` 的键名怎么起。
4. **能否自定义邮件头** —— 见 §5，这条最关键，可能影响方案。

---

## 1. 不要把 SDK 直接塞进 worker

抽一层发信通道接口，`worker.ts` 只依赖接口，不认识任何厂商。

```ts
// lib/mail/sender.ts
export type OutgoingMail = {
  to: string;
  template: string;          // verify_email | subscribe_confirm | post_published
  subject: string;
  vars: Record<string, string>;
};

export interface MailSender {
  send(mail: OutgoingMail): Promise<void>;
}

export function getMailSender(): MailSender { /* 按 MAIL_PROVIDER 选择 */ }
```

- `MAIL_PROVIDER=tencent_api`（生产）/ `smtp`（本地开发）。
- 两个实现：`lib/mail/senders/smtp.ts`（把现有 nodemailer 逻辑搬进去）、`lib/mail/senders/tencent.ts`（新增）。
- 未知的 provider 值 → 启动时抛错，不要静默降级。

**为什么要这层**：本地开发用 MailHog 或个人邮箱 SMTP 调试比走真实 API 方便得多；将来换厂商只加一个文件；现有 SMTP 相关测试不用推翻。这层薄，成本很低。

---

## 2. 拆 `renderMail`：安全校验只留一份

`renderMail()` 现在同时做了两件事——**校验/归一化 payload** 和 **拼 HTML**。API 方式不需要 HTML，但**绝对需要那些校验**。

拆成：

```ts
// 只做校验和归一化，不碰表现层
export function normalizeMail(mail: ClaimedMail): { subject: string; vars: Record<string, string> }
```

- 现有的 `safeHttpUrl()`、`safeSubject()` 全部搬进来，**一个都不能省**。`safeHttpUrl` 挡的是 payload 被污染后塞进 `javascript:` URL，`safeSubject` 挡的是主题头注入（`\r\n`）——这两个在 API 方式下同样要害。
- `renderMail()` 改为基于 `normalizeMail()` 的结果拼 HTML，供 SMTP provider 用，**行为保持不变**（现有测试应当继续通过）。
- 腾讯云 provider 直接用 `vars` 生成 `TemplateData`。

每个模板的 `vars` 键：

| template | vars |
|---|---|
| `verify_email` | `name`, `verifyUrl` |
| `subscribe_confirm` | `confirmUrl` |
| `post_published` | `postTitle`, `postSummary`, `postUrl`, `unsubscribeUrl` |

键名要和控制台模板里的变量名对得上（见 §0.3）。

---

## 3. 腾讯云 provider

```ts
// 请求体结构（字段名以官方文档为准）
{
  FromEmailAddress: process.env.MAIL_FROM_ADDRESS,   // noreply@mail.xiudou.site
  Destination: [mail.to],
  Subject: mail.subject,
  Template: {
    TemplateID: templateIdFor(mail.template),
    TemplateData: JSON.stringify(mail.vars),
  },
}
```

要求：

- **客户端只初始化一次**，模块级单例，不要每封邮件都 new。`processMailOutbox` 一次循环 10 封，每次重建客户端是浪费。
- **`FromEmailAddress` 的域名必须是 `mail.xiudou.site`** —— 那是已验证的发信域名，用主域名会被拒。
- `TemplateID` 三个模板各一个，从环境变量读，**不要硬编码**：测试和生产可能用不同模板。缺失时抛出明确错误（"模板 X 未配置 TemplateID"），不要发出去一封空邮件。
- 保留 `ReplyToAddresses`（可选），指向一个真人能看到的地址。

### 错误处理

腾讯云 SDK 的错误对象通常带 `RequestId`，**排查问题全靠它**。扩展 `safeError()`：把 `RequestId` 拼进 `last_error`，但仍然要跑现有的 URL 脱敏和 500 字截断。

注意区分两类失败：

- **可重试**：网络错误、限流、5xx —— 走现有退避重试。
- **不可重试**：模板 ID 不存在、发信地址未验证、参数非法、余额/配额耗尽 —— 重试 5 次纯属浪费，且会把额度和日志刷爆。**识别出这类错误直接置 `failed`**，不等 `attempts >= 5`。

具体哪些错误码属于不可重试，查文档后在代码里列成一个常量集合，注释写清楚判断依据。

---

## 4. 环境变量

```
MAIL_PROVIDER=tencent_api
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_SES_REGION=
MAIL_FROM_ADDRESS=noreply@mail.xiudou.site
SES_TEMPLATE_VERIFY_EMAIL=
SES_TEMPLATE_SUBSCRIBE_CONFIRM=
SES_TEMPLATE_POST_PUBLISHED=
```

- `.env.example` 补齐，**`docker-compose.yml` 的 `next` 服务全部透传**。漏透传就是生产静默失效——`NEXT_PUBLIC_ICP_BEIAN` 那次已经踩过一模一样的坑。
- `SMTP_*` 那几个**保留**，本地开发还要用。
- `TENCENT_SECRET_KEY` 是账号级凭据，权限比 SMTP 密码大得多。**建子账号并只授予邮件推送权限**，不要用主账号密钥。

---

## 5. `List-Unsubscribe` 头 —— 需要先确认，可能是个坑

`post_published` 现在带这两个头（`worker.ts:68-71`）：

```
List-Unsubscribe: <url>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

它们让 Gmail/QQ 邮箱在界面上直接显示"退订"按钮，**对送达率和垃圾箱判定有实质影响**，不是可有可无的装饰。

**问题是：SendEmail 接口不一定支持自定义邮件头。**

实现时按这个顺序处理：

1. 查文档，看有没有自定义 header 的参数，或者专门的退订链接配置项（腾讯云可能提供独立的退订功能）。
2. **能配** → 照配，行为和现在一致。
3. **不能配** → 在 PR 里**明确写出来**，并保证正文模板里的退订链接足够显眼（这时它是唯一的退订入口）。

不要默默把这两个头丢掉当没事发生。这是走 API 相比 SMTP 的实际损失，需要留在记录里。

---

## 6. 明确不做

- **不用 `BatchSendEmail`**。它需要在腾讯云侧维护收件人列表，和本地 `subscribers` 表形成两份数据、两个事实来源。继续一封一封发，`mail_outbox` 的队列模型不变。
- **不做 provider 自动降级**。API 失败不要回退 SMTP——个人认证根本用不了 SMTP，降级只会把一次明确失败变成两次莫名失败。
- **不改 `processMailOutbox` 的并发和 limit**。仍是每分钟 10 封。要提速是后续独立的事。

---

## 7. 测试

- `normalizeMail()`：三个模板的 vars 齐全；`safeHttpUrl` 拒绝 `javascript:` 等非 HTTP(S) 协议；`safeSubject` 剥掉 `\r\n`；未知模板仍然抛错。
- `renderMail()`：**现有测试必须继续通过**，拆分不得改变 SMTP 路径的行为。
- 腾讯云 provider：mock SDK，断言请求体的 `FromEmailAddress` / `Destination` / `TemplateID` / `TemplateData` 正确；`TemplateData` 是合法 JSON 字符串。
- 错误分类：mock 一个不可重试错误码 → 断言直接置 `failed` 而非等到第 5 次。
- `getMailSender()`：未知 `MAIL_PROVIDER` 抛错。
- `npm run check` 全绿。

---

## 8. 验收清单

- [ ] `MAIL_PROVIDER=tencent_api` 时真实发出一封 `verify_email`，收件箱能收到（**不是垃圾箱**）。
- [ ] 邮件源码里 SPF、DKIM、DMARC 三项验证结果均为 pass。
- [ ] `MAIL_PROVIDER=smtp` 时行为和改造前完全一致。
- [ ] 模板 ID 配错 → 邮件直接进 `failed`，`last_error` 里有 `RequestId`，不做无谓重试。
- [ ] `last_error` 中不出现 SecretKey、完整 URL 等敏感内容。
- [ ] 三个模板都能实际发出（需控制台模板审核通过）。
- [ ] `docker-compose.yml` 与 `.env.example` 已补齐全部新变量。
- [ ] 跑完 `/security-review` 无未处理高危项。

---

## 9. 实现顺序

1. `lib/mail/sender.ts` 接口 + `getMailSender()`
2. 拆 `normalizeMail()`，确认现有测试仍绿（**先做这步，它是纯重构，出问题好定位**）
3. SMTP provider 搬迁
4. 腾讯云 provider + 错误分类
5. 环境变量透传
6. 真实发信验证

第 2 步是纯重构，**建议单独提交**——把重构和新功能混在一个提交里，出了问题会很难判断是谁的锅。

---

## 10. 三套模板正文

**HTML 正文不在本文里，见 `docs/mail-templates/`**，避免同一份内容维护两处：

| 文件 | 控制台模板名称 | 代码里的 template | 变量 |
|---|---|---|---|
| `verify-email.html` | 边界笔记-邮箱验证 | `verify_email` | `name`、`verifyUrl` |
| `subscribe-confirm.html` | 边界笔记-订阅确认 | `subscribe_confirm` | `confirmUrl` |
| `post-published.html` | 边界笔记-新文章通知 | `post_published` | `postTitle`、`postSummary`、`postUrl`、`unsubscribeUrl` |

改动模板时**改文件，不要改本文**。

### 这些写法是有原因的，别按网页习惯"优化"

邮件 HTML 和网页是两套规则：没有外部 CSS、flex/grid 基本无效、Outlook 不认 `<div>` 上的 padding。所以三个文件统一是 `<table>` 布局 + 全内联样式 + 600px 定宽。看着像 2005 年的写法，但这是能在 QQ 邮箱和 Outlook 里都不散架的写法。

- **品牌头用色块 + 文字，不用图片。** 大多数邮件客户端默认屏蔽远程图片，logo 做成图片的话，很多人第一眼看到的是破图框，比没有更糟。当前方案在图片全被屏蔽时依然完整。
- **配色取自 `app/globals.css` 的 oklch token**（`primary` → `#2d60e7`，`foreground` → `#091019`，`border` → `#d9dfe6`），和站点视觉一致。
- **每封都附纯文本 URL。** 部分客户端会剥掉按钮样式或禁用链接，没有可复制的地址用户就卡死了。
- **订阅确认里"没订阅过就忽略"那句不能删。** 有人拿别人邮箱乱填时，这封信必须让收件人明白什么都不用做——这正是 double opt-in 的意义。
- **新文章通知的页脚两句不能删**："为什么收到" + 退订入口。营销/订阅类邮件缺这两样，既容易被审核打回，也容易被判进垃圾箱。

### 发件人显示名（比模板本身更影响辨识度）

收件箱列表里，用户先看到的是**发件人名称**，不是邮件正文。只显示 `noreply@mail.xiudou.site` 认不出是谁。

`FromEmailAddress` 要带显示名：

```
边界笔记 <noreply@mail.xiudou.site>
```

腾讯云是否支持在该字段直接写 `名称 <地址>`、还是需要在控制台的发信地址上配置别名，实现时查文档确认。**这一条比模板 HTML 更值得优先落实。**

主题行保持干净即可，不必加 `[边界笔记]` 前缀——发件人名解决了辨识问题，前缀只会挤占手机上本就很窄的主题显示宽度。

### 变量必须转义后再进 TemplateData —— 容易漏

模板正文是 HTML，变量是直接插进去的。`normalizeMail()` 返回的 `vars` 是**原始文本**（SMTP 路径靠 `renderMail` 里的 `escapeHtml` 兜底），所以腾讯云 provider 在生成 `TemplateData` 时**必须自己转义**：

- `postTitle`、`postSummary`、`name` —— 作者写的正文内容，出现 `<`、`&`、`"` 会直接破坏 HTML 结构（一个 `<` 就能让整封邮件排版塌掉）。
- URL 类变量 —— 已过 `safeHttpUrl` 校验协议，但查询串里的 `&` 放进 `href` 仍需转成 `&amp;`。退订链接带 `?id=&token=`，**一定会命中这个问题**。

复用 `worker.ts` 里现成的 `escapeHtml()`，不要另写一个。

先确认腾讯云在替换变量时是否已经做了转义：**已转义就别重复做**（会出现 `&amp;amp;`），未转义则由我们来做。这一条写进 PR 说明。

---

## 附：外部依赖

发信能跑通还依赖两件代码之外的事，**卡住了不是实现的问题**：

- 三个模板在控制台创建并**审核通过**（人工审核，需要时间）
- 发信地址 `noreply@mail.xiudou.site` 状态正常

建议先只提 `verify_email` 模板审核，用它跑通链路，另外两个并行等。

参考文档：
- [发送邮件 SendEmail](https://cloud.tencent.com/document/product/1288/51034)
- [创建邮件模板](https://cloud.tencent.com/document/product/1288/51042)
