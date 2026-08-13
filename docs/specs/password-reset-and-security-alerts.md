# Codex Spec：密码重置 + 安全变更通知

## 背景

`userActionTokenType` 枚举里定义了 `reset_password` 和 `change_email`，但**全项目零引用**——「忘记密码」这个功能根本不存在。用户一旦忘记密码就永久锁死，只能由管理员改数据库。

同时 `account/actions.ts` 的改密码流程本身做得很扎实（验旧密码、8 字符下限、弱密码黑名单、撤销其他会话、审计日志、全程事务），**唯独没有事后通知**——密码被改了，账号主人不会收到任何消息。

本次补两件事：

1. **忘记密码 → 邮件重置**（全新流程）
2. **安全变更通知邮件**（改密码、重置密码后各发一封）

> 明确不做「改密码需要点邮件确认」。旧密码已经是一道验证，再加一次邮件确认只会增加合法用户的摩擦；而当邮箱本身已被攻破时，邮件确认反而替攻击者省掉了旧密码这道门。行业标准是**验证旧密码 + 事后通知**，本文按这个来。

> 分工：本文交 Codex 实现，Claude 审查。涉及凭据重置，完成后**必须跑 `/security-review`**。

---

## 1. 忘记密码流程

### 1.1 请求重置：`/forgot-password`

页面：一个邮箱输入框。登录页 (`app/(auth)/login`) 加一个「忘记密码？」链接指过来。

Server Action 逻辑：

1. zod 校验邮箱，`trim().toLowerCase()` 归一化。
2. **限流**（见 §1.4）。
3. 查 `users`。以下情况**一律静默跳过，不发信**：
   - 邮箱不存在
   - `disabledAt` 或 `deletedAt` 非空
   - **`passwordHash` 为空**（纯 GitHub 登录的用户没有密码可重置）
4. 通过则：签发 token（`createActionToken()`）写入 `user_action_tokens`，`type: "reset_password"`，**TTL 60 分钟**；往 `mail_outbox` 塞一封 `password_reset`。
5. **所有分支返回同一句话**：「如果该邮箱可用，重置邮件将会发送」。

第 5 点是硬要求，和 `register/actions.ts:25-28`、订阅表单是同一个处理方式。返回「该邮箱不存在」等于把这里变成账号枚举接口。

> TTL 用 60 分钟而不是验证邮件那样的 24 小时：重置链接的权限等价于账号本身，暴露窗口要短。

### 1.2 消费 token：`/reset-password?token=...`

页面渲染新密码表单（新密码 + 确认新密码）。**token 只在提交时校验**，页面本身不预先验证——预验证会让 token 出现在两次请求里，且没有实际收益。

提交后在**一个事务**内：

1. `digestActionToken(token)` 查表，条件完全照抄 `verify-email/actions.ts`：
   ```
   tokenDigest = digest
   type = 'reset_password'
   consumedAt IS NULL
   expiresAt > now()
   ```
   用 `UPDATE ... SET consumedAt = now() ... RETURNING userId` 原子消费，**不要先 SELECT 再 UPDATE**。
2. 新密码走**和改密码完全相同的校验**：`passwordSchema`（≥8 字符）+ `isBlockedPassword()`。不许因为是重置路径就放宽。
3. 再次确认用户 `disabledAt` / `deletedAt` 为空（签发到消费之间可能被禁用）。
4. `hashPassword()` 写入，更新 `passwordChangedAt`。
5. **撤销该用户的全部会话**——照抄 `account/actions.ts:94-100` 那段，然后 `clearRegisteredSessionCache()`。重置密码的典型场景就是账号可能已失陷，旧会话必须全清。
6. 写审计日志 `account.password.reset`。
7. 入队一封 `security_alert`（见 §2）。
8. **作废该用户其它未消费的 `reset_password` token**，避免同时存在多条有效链接。

失败时渲染中性提示「链接无效或已过期」，不要区分「不存在」「已用过」「已过期」。

### 1.3 完成后

跳转登录页并提示「密码已重置，请重新登录」。**不要自动登录**——刚重置完就建立会话，等于把「拿到邮件链接」直接兑换成登录态，削弱了这道流程本身的意义。

### 1.4 限流

`/forgot-password` 是公开写接口且会发信，必须限流。复用 `lib/subscribe/rate-limit.ts` 的 Redis + Lua 模式（key 做 sha256，不明文存邮箱）：

- 同一 IP：每小时 5 次
- 同一邮箱：每小时 2 次

超限**依然返回那句统一文案**，不要返回 429——否则又成了探测接口。

IP 用 `extractClientIp()`（`lib/auth/device.ts`），它优先取 `x-real-ip`，而 nginx 用 `$remote_addr` 强制覆盖该头，伪造不进来。

---

## 2. 安全变更通知

新增模板 `security_alert`，**做成通用的变更通知**，将来改邮箱、新设备登录都能复用。

### 2.1 触发点

| 场景 | 位置 | `actionLabel` |
|---|---|---|
| 用户主动改密码 | `app/(site)/account/actions.ts` | `密码已修改` |
| 通过邮件重置密码 | §1.2 第 7 步 | `密码已重置` |

两处都在**原有事务内**入队，和密码变更同生共死：密码改了但通知没入队，或反过来，都不允许。

### 2.2 payload

```
actionLabel   密码已修改 / 密码已重置
occurredAt    已格式化的上海时区时间字符串，例如 2026-08-04 15:30
deviceName    describeDevice() 的结果，例如 Chrome · Windows；取不到时传 未知设备
accountUrl    https://xiudou.site/account
```

**不要把完整 IP 放进邮件。** 邮件可能被转发、被截图，IP 属于不必要的暴露。设备描述加时间足够让用户判断「是不是我」。

### 2.3 收不到也不能挡住主流程

发信失败不得影响密码变更本身。入队是事务的一部分，但**投递失败只体现在 `mail_outbox.status`**，不回滚已改好的密码。现有 worker 的重试机制照常工作。

---

## 3. 邮件模板

两个新模板，HTML 见 `docs/mail-templates/`：

| 文件 | 控制台模板名称 | 代码里的 template | 变量 |
|---|---|---|---|
| `password-reset.html` | 边界笔记-重置密码 | `password_reset` | `resetUrl` |
| `security-alert.html` | 边界笔记-安全提醒 | `security_alert` | `actionLabel`、`occurredAt`、`deviceName`、`accountUrl` |

同步要改的地方：

- **`lib/mail/message.ts`**：`normalizeMail()` 加两个 case，URL 走 `safeHttpUrl()`；`MailTemplate` 联合类型扩展。
- **`renderNormalizedMail()`**：加对应的 SMTP 纯文本/HTML 版本（本地开发要用）。
- **`lib/mail/senders/tencent.ts`**：`templateId()` 的映射表加两项，读 `SES_TEMPLATE_PASSWORD_RESET` / `SES_TEMPLATE_SECURITY_ALERT`。
- **`TriggerType`**：这两个都是**触发类**（和 `verify_email` 同类），不是营销类。
- `.env.example` 与 `docker-compose.yml` 补两个新的 TemplateID 变量。

> `security_alert` **不要带 `List-Unsubscribe`**。安全通知不是可退订的营销邮件，带上退订头反而会让部分客户端把它归到促销分类。

---

## 4. 测试

- 请求重置：邮箱不存在 / 已禁用 / 无密码（OAuth 用户）三种情况**返回文案与正常情况完全一致**，且不入队邮件。
- token 消费：过期拒绝、重复使用拒绝、`type` 不匹配拒绝（拿 `verify_email` 的 token 来重置密码必须失败）。
- 重置成功后该用户全部会话被撤销。
- 重置路径的密码校验与改密码路径**完全一致**（8 字符、黑名单）。
- 同一用户签发第二个重置 token 后，第一个失效。
- `normalizeMail()`：两个新模板 vars 齐全，非 HTTP(S) 的 URL 被拒。
- 限流：超阈值后不发信，但文案不变。
- `npm run check` 全绿。

## 5. 验收清单

- [ ] 登录页有「忘记密码」入口。
- [ ] 走完整流程能重置成功并用新密码登录。
- [ ] 重置后所有旧会话失效（另一台设备被登出）。
- [ ] 重置链接**用过一次即失效**，60 分钟后过期。
- [ ] 拿 `verify_email` 的 token 无法重置密码。
- [ ] 改密码和重置密码各收到一封安全提醒，内容含时间和设备，**不含 IP**。
- [ ] 不存在的邮箱与真实邮箱，页面返回**一字不差**。
- [ ] 纯 GitHub 登录的用户请求重置，不会收到邮件也不会报错。
- [ ] `.env.example` 与 `docker-compose.yml` 已补新变量。
- [ ] 跑完 `/security-review` 无未处理高危项。

## 6. 实现顺序

1. `normalizeMail()` 两个新模板 + 测试（**纯增量，先做**）
2. 安全通知接到已有的改密码流程（**立刻有价值，且不依赖新页面**）
3. `/forgot-password` 请求流程 + 限流
4. `/reset-password` 消费流程 + 会话撤销
5. 登录页入口

第 2 步单独提交——它给现有功能补上了缺失的通知，和后面的新页面互不影响。

---

## 附：外部依赖

两个新模板要在腾讯云控制台创建并**通过审核**。加上原有的三个，一共五个模板。

按重要性提审顺序建议：`password_reset` → `security_alert` → 其余。密码重置是账号可用性的底线功能，比订阅推送重要得多。

## 附：不做

- 改邮箱流程（`change_email` token 类型同样闲置，但改邮箱功能本身还不存在，等做的时候一起）
- 新设备登录提醒（`security_alert` 模板已为此预留，本次不接）
- 重置后自动登录（理由见 §1.3）
