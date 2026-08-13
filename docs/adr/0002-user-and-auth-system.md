# ADR-0002: 工业级用户与认证系统

状态：**已接受（Accepted）· rev.6** — rev.2 改掉两个硬阻塞（会话策略与 Credentials 不兼容、reader 提权）；rev.3 补第二轮评审（seed 冲掉 argon2、登录后路由、撤销窗口、MFA-pending 提权、发信 outbox、邮箱规范化、特性开关、验收测试）；rev.4 补第三轮评审（邮箱规范化走标准 adapter、outbox 加密脱敏、`requireUser()` 拒绝 mfaPending、生产迁移空档）；rev.5 补第四轮评审（MFA 状态机四情形、会话 allowlist、§11 表同步、bcrypt 迁移顺序、seed 非 admin 报错、基础设施软化）；rev.6 定案账号注销、默认 smarthost、HTTPS 路径，并补齐 Caddy 权限/可信回源、MFA enrollment 守卫、注销凭据清理和特性开关语义。文档不再留未决项。
关联：扩展 ADR-0001 的 §7 数据模型、§8.4 Redis、§10 权限。
Owner 已确认：默认使用**外部 smarthost 的 SMTP transport** 发信（本机直投列为可选升级）、**启用 OAuth** 登录；合规（§14）暂不纳入本设计范围。

> **范围声明（修订）**：本 ADR 只覆盖**安全与账号工程基线**，**不**宣称完成 PIPL / UGC 合规。在独立的合规 ADR 完成前，**不得开放公众注册与评论**。开头不再自称"合规基线"，以免与 §14 的排除自相矛盾。

---

## 0. 基础设施前置门禁（评审新增，先于一切）

**真正的依赖不是"Docker"这一具体形态,而是三条能力(评审修订——原表述过死)**:**可用的 Redis、可用的 HTTPS、可用的 SMTP 投递路径**。这些**不必**依赖 Docker/sudo:当前腾讯云已能以**普通用户态**跑 Redis 与 Postgres(见 `start.sh`),smarthost 模式也**不一定**需要本机 Postfix/容器。逐项:

| 能力 | 谁需要它 | 可行形态(不限 Docker) | 缺失后果 |
|---|---|---|---|
| **HTTPS** | `Secure`/`__Host-` Cookie（§7）、OAuth 回调 | 反代/托管证书均可 | Cookie 装不上、OAuth 拒非 HTTPS 回调 |
| **Redis** | 会话缓存/限流（§7、§9） | **已有**(用户态进程) | — |
| **SMTP 投递路径** | 验证/找回发信（§6） | 直投(需出站 25 + PTR)**或** smarthost(仅需出站到上游) | 注册/找回不可用 |

**HTTPS 落地定案:反向代理 + 自动证书(Caddy)**——理由:Caddy 单二进制即可运行,内置 ACME **自动签发/续期** Let's Encrypt 证书,配置比 Nginx+certbot 简单一截;它在前面终止 TLS 并反代到 `127.0.0.1:3000`。但 Linux 普通用户默认**不能绑定 1024 以下端口**，所以“用户态运行”仍需一次性取得下列条件之一：

- **Caddy 直终止 TLS（首选）**：放行安全组 80/443，并由管理员给 Caddy 二进制授予 `CAP_NET_BIND_SERVICE`（或配置等价的 root 端口转发/authbind）；仅放行安全组本身不解决低端口绑定权限。
- **云 TLS 终止（无上述权限时）**：使用云厂商 CDN / 负载均衡托管证书，经私网地址或受限回源端口转发到应用——同样满足 `Secure`/`__Host-` Cookie 与 OAuth 回调对 HTTPS 的要求。

无论哪条,应用侧都通过 `X-Forwarded-Proto` 感知 HTTPS(NextAuth `trustHost: true` 已开)，但**只信任受控代理写入的转发头**。应用源站不得继续以不受限的 `0.0.0.0:3000` 暴露公网：Caddy 同机时绑定 `127.0.0.1:3000`；云 TLS 回源时绑定私网地址，并用安全组只允许负载均衡/CDN 回源地址，防止绕过代理直接访问或伪造 `Host`/`X-Forwarded-Proto`。

**门禁**：P0 之前必须确认 **HTTPS 可达**(Caddy 或云 TLS 二选一)且 **至少一条 SMTP 投递路径可用**(默认 smarthost)。这三条能力就位即可,**不把"上 Docker"当作硬前提**。

---

## 1. 背景与约束

现状：

- 认证是 Auth.js（NextAuth v5）**Credentials-only**，仅 `/login`，**无任何注册入口**。
- `users` 角色为 `admin / editor / author`，为**受邀员工**设计，靠 `seed-admin` 脚本创建。
- 评论表 `comments` 用 `authorName + authorEmail` 纯文本（**访客模型**，二者 `NOT NULL`），无指向用户的外键。
- 会话策略为 **JWT**（`auth.ts:17`）。
- 后台鉴权**只判是否登录**：`app/admin/layout.tsx:14` 仅 `redirect("/login")`；`app/admin/posts/actions.ts:39` 仅 `requireUser()`；建文章时 `authorId = user.id`（`actions.ts:70`）；`lib/auth/permissions.ts:10` 的 `canManagePost` 放行"本人名下文章"。

目标：引入**面向公众的注册**，把平台从"员工发布制"扩展为"注册用户可参与（评论、点赞、收藏等）"。

约束（继承 ADR-0001）：**复用** NextAuth v5 + Drizzle + PostgreSQL + Redis；受 PIPL 及 UGC 相关法规约束（合规另行处理）。

> **必须先修的提权隐患**：`users.role` 当前 DB 默认值为 `author`（`schema.ts:36`）。开放自注册前**必须**改为 `reader`。**但仅改默认值不够**——见 §3 铁律与 §10.0，后台鉴权本身有洞。

---

## 2. 核心决策速览

| 维度 | 决策 | 理由（一句话） |
|---|---|---|
| 角色模型 | 加 `reader`，员工角色仍邀请制、自注册只给 `reader` | 防提权；读者与员工是两类主体 |
| 注册方式 | 邮箱+密码（带验证） + OAuth（GitHub/Google） | 密码通用；OAuth 降门槛 |
| 密码哈希 | **argon2id**，登录时从 bcrypt 渐进 rehash；**参数须实机压测** | 现代标准；平滑迁移；避免内存 DoS |
| 会话 | **保留 JWT，但加有状态会话注册表**（`sessionVersion` + `jti`，每次认证查 Redis/DB） | Credentials + 数据库会话在当前 Auth.js **不兼容**（§7）；有状态校验的 JWT 同样可撤销 |
| 邮箱验证/找回 | 独立的 `user_action_tokens`：高熵、**哈希入库**、单次原子消费、短过期 | 不与 Auth.js `verification_tokens` 混用；库泄露也拿不到可用 token |
| MFA | TOTP + 恢复码 + **AAL/step-up** 状态机；**admin/editor 强制**（带宽限期） | 后台账号是最高价值目标 |
| 防滥用 | Redis 双维度限流 + 账号退避 + 注册 CAPTCHA | 抵御撞库、暴力破解、注册机 |
| 匿名评论 | **关闭**，评论需登录 | 匿名评论低质、垃圾重灾区 |
| 邮件通道 | 默认由 app 通过 SMTP transport 连接**外部 smarthost**；本机 Postfix 直投为可选升级 | 避免 2GB 云机承担 IP 信誉、PTR 与出站 25 风险；退信走上游回调/外部 bounce 通道（§6） |

---

## 3. 身份与角色模型

角色枚举扩展为：`reader < author < editor < admin`（`user_role` 增加 `reader`）。

| 角色 | 来源 | 能力 |
|---|---|---|
| `reader` | **自注册**（默认） | 登录、评论、点赞/收藏、管理自己的资料与会话 |
| `author` | admin 提升/邀请 | reader 全部 + 写自己的文章、走审核 |
| `editor` | admin 提升/邀请 | author 全部 + 管理他人文章、审核发布 |
| `admin` | seed / 另一个 admin | 全量 + 用户管理、角色变更、系统设置 |

**铁律（修订——原文错误）**：自注册路径**只能**产出 `reader`。~~`canManagePost` 无需改动~~ 是错的：

- 后台布局只判登录（`admin/layout.tsx:14`），reader 登录即可进 `/admin`。
- Server Action 只 `requireUser()`（`actions.ts:39`），新文章 `authorId = user.id`（`actions.ts:70`），而 `canManagePost` 放行本人文章（`permissions.ts:10`）——**reader 可直接调 `savePostAction` 建出属于自己的文章并管理它**。UI 隐藏入口挡不住直接调用 Server Action。

因此**必须新增服务端角色守卫**（§10.0），在布局、页面、每个 Server Action 三处分别校验，不能只靠 UI。

---

## 4. 注册与登录

### 4.1 邮箱 + 密码
1. 提交邮箱+密码 → 校验策略（§5）→ 创建 `reader`，`emailVerified = null`。
2. 发送验证邮件（§6）。**验证通过前**限制敏感能力（发评论等），采"必须先验证"更清晰。
3. **防枚举**：注册接口一律返回"若邮箱可用，验证邮件已发送"，不泄露是否已注册。

### 4.2 OAuth（GitHub / Google）
- 经 NextAuth OAuth provider + adapter 的 `accounts` 表落地。**provider 身份主键用稳定的 `sub`（Google）/ 数值 `id`（GitHub），绝不以 email 作 OAuth 主键**。
- **Google**：必须检查 `email_verified` claim，为 false 时视同未验证，不得据此自动置位或合并。
- **GitHub**：GitHub 允许未验证邮箱，且 id_token 不含邮箱。必须显式调用 `GET /user/emails`，取 `primary && verified` 的邮箱；无则要求用户补验证，不假设返回邮箱可信。

### 4.3 账号合并（同邮箱多来源）—— 收紧
Auth.js 把"同邮箱自动关联"命名为 `allowDangerousEmailAccountLinking`，**默认关闭**（拒绝自动关联）。本设计**沿用默认关闭**：

- 新 OAuth 身份**首次**登录：允许创建新账号。
- 若该邮箱**已存在账号**：**一律不自动合并**，要求先登录原账号，再到 `/account` 手动绑定第三方。
- 杜绝"攻击者用受害者邮箱注册 → 受害者 OAuth 登录被并入攻击者账号"。

### 4.4 登录后按角色路由（评审新增）
现 `app/login/page.tsx:15` 对**任何**已登录用户 `redirect("/admin")`；开放 reader 后会变成 "reader 登录 → 跳 `/admin` → `requireStaff` 拒绝" 的死循环体验。定案：

- **reader** → 原 `callbackUrl`，否则 `/account`。
- **author / editor / admin** → `/admin`。
- 已登录 **reader** 再访问 `/login` → 去 `/account`（不再无脑去 `/admin`）。
- 文案：`login/page.tsx:25` 的"使用管理员或作者账号继续"改为面向公众的措辞（后台入口另做区分）。

---

## 5. 密码与凭据安全（按 NIST 800-63B-4 校正）

- **哈希**：argon2id。现有 bcrypt 哈希在**下次成功登录时**迁移为 argon2id，不强制改密。**argon2id 的内存/并行/迭代参数必须在当前 2GB 腾讯云实机压测**——参数过高时并发登录会自己造成内存 DoS。
- **迁移顺序（评审补，别把老用户锁在门外）**:旧 bcrypt 校验**必须用用户的原始输入**(bcrypt 存的就是原始字节的 hash);**校验通过后**再对同一明文做 **NFC 规范化 → argon2id** 重哈希覆盖。**切勿先 NFC 再比对 bcrypt**——否则少数含 Unicode 的旧密码会永远登录失败。
- **新长度下限不追溯老用户**:§5 的"单因子最少 15 位"只作用于**新注册/改密**;既有用户凭旧密码登录**不因未达 15 位被拒**,只在其主动改密时按新策略要求。
- **长度**：`reader` 的 MFA 可选，默认属**单因子**，故按 SP 800-63B-4 **最少 15 个字符**（仅当作为 MFA 一环时才可降到 8）；**最大长度 ≥ 64**。
- **弱口令拦截**：**泄露/常用口令 blocklist 为必选**（硬拒），`zxcvbn` 仅做前端强度提示、**不能替代 blocklist**；HIBP（k-anonymity 前缀查询）作为**可选**外部增强。
- **规范化**：口令按 **Unicode NFC** 规范化后再哈希/比对。
- **响应**：TLS；库内只存哈希；"邮箱不存在 / 密码错误"错误信息**不做区分**。

### 5.1 Seed 脚本必须同步改（评审：当前最大回归）
现状会**主动破坏** argon2 渐进迁移：`infra/user-deploy/start.sh:49` **每次启动**都执行 `seed-admin.cjs`，而 `seed-admin.cjs:19-28` 用 **bcrypt** + `ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED...` —— 即"管理员登录被升级为 argon2 → 服务器一重启又被覆写回 bcrypt"。本地 `scripts/seed-admin.ts:13,17` 同病（bcrypt + 对已存在用户 `update` 覆盖密码）。

定案（两份脚本一起改）：

- 两份 seed 改用 **argon2id**（与 §5 一致）。
- **仅在管理员不存在时创建**,**启动路径绝不重置已存在管理员的密码**。但**不能简单 `ON CONFLICT DO NOTHING`**:若同邮箱已存在**但角色不是 admin**,应**直接报错退出**(否则会"启动看似成功、实际没有可用管理员")。逻辑:查该邮箱 → 无则创建 admin → 有且为 admin 则跳过 → 有但非 admin 则 fail-fast。
- **强制重置管理员密码**独立成一条运维命令（如 `pnpm admin:reset-password`），只手动执行，不进 `start.sh`。
- 顺带：`start.sh` 里 seed 应对"已存在则跳过"幂等，避免每次重启写库。

---

## 6. 邮箱验证、找回与发信

### 6.1 业务 Token（不与 Auth.js 混用）—— 见 §11 表
邮箱验证 / 找回 / 换邮箱走**独立** `user_action_tokens`。规则：

| 项 | 规则 |
|---|---|
| 生成 | CSPRNG 高熵随机串 |
| 入库 | **仅存摘要**（`tokenDigest`，SHA-256），明文只在邮件链接里 |
| 一次性 | **原子消费**：`DELETE ... RETURNING` / `UPDATE ... WHERE consumed_at IS NULL RETURNING`，杜绝并发重复使用 |
| **链接不在 GET 消费** | 邮件安全扫描器会自动打开链接。验证/找回链接的 **GET 只展示确认页**，用户 **POST** 后才原子消费 token，避免扫描器提前作废 |
| 过期 | 邮箱验证 24h；找回密码 1h |
| 找回副作用 | 改密成功后 **bump `users.sessionVersion`**（§7）→ 全端登出 |
| 频率 | 同邮箱/IP 发信限流（§9），防邮件炸弹 |

### 6.2 发信通道：默认 smarthost，可选本机直投
**先区分两种投递模式**，二者共用同一发信抽象，切换仅是配置(默认见下方定案)：

- **直投模式**：Postfix 作完整 MTA，直接投到收件方 MX。需要**出站 25 + PTR + 干净 IP 信誉**（§6.3），送达责任全在自己。
- **smarthost 模式**：Postfix 只做内部 relay，把邮件转发给上游 smarthost，送达率由上游负责。仅需出站到 smarthost 端口。

**定案:默认 smarthost 模式**——理由:当前是 2GB 腾讯云、出站 25 常被云厂商默认封、干净静态 IP + PTR + 信誉预热是慢且脆的长期工程,而验证/找回邮件是**账号系统的硬依赖**,不能拿送达率赌。smarthost(上游端口 587/465 + SASL)一条配置即可、送达率外包,且 §6.4 退信可直接消费上游回调。

**smarthost 模式下不必本机 Postfix/Docker**:app 经 SMTP 客户端(如 nodemailer)直接把邮件投给上游 smarthost 即可,发信抽象背后是"一个 SMTP transport"。仅当选直投模式时才需要本机完整 MTA(Postfix + OpenDKIM)。**直投列为可选升级**:日后拿到独立干净 IP + 出站 25 放行 + 可设 PTR 时,把发信抽象的 transport 从 smarthost 换成本机 MTA 即可,业务代码不变。

### 6.3 送达率工程（**仅直投模式需要**）

| 项 | 要求 | 不做的后果 |
|---|---|---|
| **出站 25** | 云厂商放行出站 TCP 25 | 大量云主机默认封 25，一封发不出 |
| **rDNS / PTR** | 发信 IP 反解 = HELO 的 FQDN，正反解析一致 | 主流邮箱直接拒收——自托管头号杀手 |
| 专用发信子域 | `mail.example.com`，独立信誉 | 污染主域信誉 |
| SPF / DKIM / DMARC | 授权 IP、OpenDKIM 签名、发布策略 + rua 收报告 | 普遍判垃圾、无从排障 |
| IP 信誉 / 预热 | 干净静态 IP（不在 DNSBL），新 IP 低量缓升 | 灰名单节流、进黑名单 |
| 内容规范 + 监控 | 正确 From/Reply-To/Message-ID/Date、plain+HTML；退信率/DNSBL 自查 | 触发垃圾规则、信誉恶化不自知 |

### 6.4 退信收集（修订——原文自相矛盾）
原 ADR 同时写"只发不收"与"VERP/bounce 收集退信"，**逻辑矛盾**：收集 SMTP 退信需要**能收邮件**。定案：

- 本系统**不开放入站 SMTP 中继**（不当开放 relay）。
- 但硬退信/抑制列表需要一个**能接收的 bounce 通道**：用**外部 bounce 邮箱 / 上游服务的退信回调**收集，落库成**收件人抑制表**，避免反复投递坏地址拖垮信誉。
- smarthost 模式下退信通常由上游以回调/日志形式提供，直接消费即可。

### 6.5 P0 可行性门禁（先于建完整 Postfix）
**默认直接走 smarthost**(§6.2 定案),P0 只需备一个可用上游(自有域名的 smarthost / 上游中继);**不**一上来砌完整 MTA。仅当明确要自投递时才过下面的门禁:

```
（默认路径）选定 smarthost 上游 → app SMTP transport 指向它 → 完成
（可选·直投升级）域名 → 出站 25 可用? → PTR 可设? → 有 DNS 控制权?
  ├─ 全满足 → 直投模式（完整 Postfix + §6.3）
  └─ 任一不满足 → 保持 smarthost
```

### 6.6 发信可靠性：transactional outbox（评审新增）
"创建验证 token" 与 "提交邮件给 SMTP transport" 是两个系统:DB 事务提交成功、但 app→smarthost/本机 MTA 提交失败时,会出现"用户存在却永远收不到验证邮件"。上游或 Postfix 的持久队列**只**保障"已提交给 SMTP transport 之后"的可靠性,保障不了 app 到 transport 这一段。

定案:新增 `mail_outbox` 表,注册/找回事务内**同时**写用户、token、outbox 记录;独立 worker 轮询重试投递。

**payload 含明文 token 的处理(评审补——否则等于把明文 token 换个表存)**:验证链接里带明文 token,直接明文落 `payload` 会让 `mail_outbox` 成为可用 token 的第二份泄露源。故:

| `mail_outbox` 列 | 用途 |
|---|---|
| `id` / `template` / `recipient` | 路由与模板 |
| **`payloadEnc`** | 模板参数(含链接)**用独立密钥加密**后存,不落明文 |
| **`encryptionKeyVersion`** | 支持密钥轮换 |
| `status`(`pending/sent/failed`) / `attempts` / `nextAttemptAt` | 重试退避 |
| `createdAt` / `sentAt` / **`redactedAt`** / `lastError` | 审计;投递成功后立即脱敏/清 payload |

- 投递成功即清除或脱敏 `payloadEnc`(记 `redactedAt`);重试耗尽 / token 过期后也清理。
- **`lastError` 不得记录完整邮件正文或验证 URL**。

---

## 7. 会话策略（评审：**硬阻塞已改**）

**背景**：原 ADR 决定用**数据库会话**，但项目要保留邮箱密码的 **Credentials provider**。当前安装的 Auth.js 在 "Credentials + 非 JWT 策略" 时会抛 `UnsupportedStrategy`（见 `node_modules/@auth/core/src/errors.ts`）。**故原方案无法原样落地。** 且"纯 JWT 绝对无法撤销"说法过绝——**有状态校验的 JWT 可以撤销**，只是不再无状态。

**定案（更适合本项目）**：**保留 JWT 策略 + 有状态会话注册表**。

- `users` 增 `sessionVersion int`（全端登出/改密/封禁/角色变更时 `+1`）。
- 签发的 token 内嵌 `jti`（会话 id）与签发时的 `sessionVersion`。
- **每次认证在 `jwt`/`session` 回调里做有状态校验**（查 Redis，miss 回源 DB）：
  - `disabledAt` 非空 → 拒绝（**登录时和每次会话读取时都查**，不能只在登录查）。
  - token 内 `sessionVersion` ≠ 用户当前值 → 拒绝（改密/封禁/全端登出即时生效）。
  - **会话 allowlist(准入)模式**:token 的 `jti` 必须在 `user_sessions` 有对应记录且 **未 `revokedAt`、未过 `expiresAt`**,否则拒绝。删除会话记录 = 单设备登出;清理过期记录、全端登出语义统一,**无需另维护一份吊销名单**(黑名单)。
- **可撤销的三类动作**都落到上述校验：封禁、改密/"登出所有设备"、单会话吊销。

**缓存一致性（评审补）**：Redis 只是加速，**权威在 DB**。

- 角色变更、改密、MFA 变化、封禁 → **同一事务后主动失效 Redis 对应键**（不能等 TTL）。
- 定义 Redis 键 TTL（短，如 30–60s）+ 主动失效双保险。
- **Redis 故障策略**：认证校验取 **fail-closed**（Redis 不可用时回源 DB，DB 也不可达则拒绝敏感操作），不允许 fail-open 放行已封禁用户。

**撤销窗口的诚实表述（评审修订）**：DB 事务与 Redis 删除**无法**放进同一原子事务;Redis 删除失败或并发读到旧缓存时,旧会话最长可能再有效一个 TTL。故措辞从"立即失效"改为 **"最长 60 秒撤销窗口"**。若某类状态要求**零窗口**(如封禁高危账号),该类校验**每次直接查 DB、不走缓存**——以延迟换确定性。(outbox/事件重试可缩短但仍非数学零窗口。)

（备选：若坚持数据库会话，则**不能再用 Auth.js Credentials provider**，需自建密码登录与会话签发，OAuth 才交给 Auth.js——实现复杂度与安全责任明显更高，非首选。）

Cookie：`httpOnly` + `Secure` + `SameSite=Lax` + `__Host-` 前缀（依赖 §0 的 HTTPS）；NextAuth 负责 CSRF 与会话固定防护。

### 7.1 会话注册表字段与过期规则（评审补全）
仅 `sessionToken/expires` 不足以支撑 §10.2 的"活跃设备列表"。会话注册表（DB 表 `user_sessions` + Redis）至少含：`jti/sessionId`、`userId`、`createdAt`、`lastSeenAt`、**`lastSeenWriteAt`**、**`expiresAt`**、`ip`、`userAgent`、`deviceName`、`revokedAt`。

- **`lastSeenAt` 不每请求写库**:内存/Redis 记录,**每 5–10 分钟异步落库一次**(用 `lastSeenWriteAt` 控节流),避免每请求一次写放大。
- **绝对过期**:JWT 设 `expiresAt`(如 30 天),到点强制重登。
- **空闲过期**:超过空闲阈值(如 14 天无活动)即失效。
- **单设备登出**:置该会话记录 `revokedAt`(或直接删除),§7 的 allowlist 校验即拒——不维护独立黑名单。
- **旧 JWT 迁移**:上线前签发的 JWT **没有 `jti`/`sessionVersion`**。定案取**最简策略**——上线时让**现有 JWT 全部失效**(bump 全局版本或轮换签名密钥),管理员/用户重新登录;不做向后兼容分支。

---

## 8. 多因子认证（MFA）—— 补全状态机

- **TOTP**（RFC 6238）+ 一次性**恢复码**（哈希存储）。
- **强制范围**：admin / editor 强制；author 建议；reader 可选。
- **登录状态机（评审修订——密码校验通过后按四种情形分支,消除"何时进 mfa_pending"的歧义）**:密码校验通过后:
  1. **未启用且不强制 MFA**(如普通 reader):直接发放**完整会话** `aal=1`,**不进** `mfa_pending`。
  2. **强制 MFA、宽限期内、尚未绑定**(`mfaRequiredAfter > now` 且未绑 TOTP):发放**完整会话** `aal=1`(**非 mfaPending**),但敏感操作(step-up)受限,横幅催促绑定。
  3. **已绑定 MFA**(无论角色):进入 **`mfa_pending`**(`aal=1` + `mfaPending=true`,仅 `requireMfaChallenge()` 端点可达),校验 TOTP/恢复码通过 → 升级为完整会话,记 **`mfaVerifiedAt`** 与 **`aal=2`**。
  4. **强制 MFA、宽限期已过、仍未绑定**(`mfaRequiredAfter <= now` 且未绑):签发受限 token，标记 `mfaEnrollmentRequired=true`；只能访问 **MFA 绑定端点与退出**,绑定完成后按情形 3 走校验。
- 即:**`mfaPending` 仅出现在"已绑定 MFA 待校验"这一种情形**;宽限期会话是完整 `aal=1`、**不是** mfaPending。实现者据此判断即可。
- **敏感操作**(改密/改邮箱/改角色/关 MFA/删账号)一律走 `requireStepUp()`,要求 `aal=2` 且 `mfaVerifiedAt` 未过旧——**即使在宽限期内也必须先完成一次 MFA**(未绑定则先绑定)。
- **MFA 重置**：提供 admin 重置他人 MFA 的流程，**全程写审计**。
- **密钥轮换**：TOTP secret **加密存储**（密钥独立于 DB），并带 **`keyVersion`** 字段支持轮换。
- **恢复码**：生成时**仅展示一次**；**逐个消费**（用后标记）；**重新生成使旧码全部作废**。
- WebAuthn/Passkey 列为后续增强（§16）。

---

## 9. 防滥用与限流（Redis）

| 面 | 机制 |
|---|---|
| 暴力破解 / 撞库 | 登录按 **IP + 账号** 双维度令牌桶；连续失败用**账号维度延迟 + IP 限速 + CAPTCHA 升级**,**不硬锁账号**（纯凭失败次数硬锁会被攻击者用来锁死受害者账号）|
| 注册机 | 注册页 **CAPTCHA**（Cloudflare Turnstile，自托管友好）或蜜罐字段 |
| 邮件炸弹 | 验证/找回发信按 邮箱 + IP 频率限制 |
| 枚举 | 注册/登录/找回统一模糊响应 |

限流窗口用 Redis"可重建"等级（无需持久化）。**注意与 §7 的 fail-closed 区分**：限流可 fail-open（Redis 挂了宁可放行也别锁死全站登录），但**会话/封禁校验必须 fail-closed**。

---

## 10. 授权、审计与账号管理

### 10.0 服务端角色守卫（评审新增，硬要求）
**注意**:Auth.js Credentials 校验成功本身就会签发 JWT——即便标了 `aal=1 / mfaPending=true`,若守卫**只查角色**,一个 MFA 未验证的 admin 仍能进后台。故守卫必须**同时查认证等级**。在 `lib/auth/permissions.ts` 增加：

```
requireMfaChallenge() // 只接受 mfaPending 会话，仅供 MFA 验证 / 取消登录端点
requireMfaEnrollment() // 只接受 mfaEnrollmentRequired 会话，仅供 MFA 绑定 / 退出端点
requireUser()         // 必须是【完整会话】，拒绝 mfaPending —— 资料/评论/普通账号接口
requireStaff()        // author/editor/admin，且【强制 MFA 的角色须满足下方宽限期规则】
requireEditor()       // editor/admin（同规则）—— 管理他人文章、审核
requireAdmin()        // admin —— 用户/角色/系统
requireStepUp()       // aal=2 且 mfaVerifiedAt 未过期 —— 改密/改邮箱/改角色/关MFA/删账号
```

- **修正 rev.2 的自相矛盾**:原 `requireUser()` 写"含 mfaPending 态",会让所有走 `requireUser()` 的资料/评论接口放行未完成 MFA 的会话。现定案 **`requireUser()` 同时拒绝 `mfaPending` 与 `mfaEnrollmentRequired`**；前者只有 `requireMfaChallenge()` 接受，后者只有 `requireMfaEnrollment()` 接受。
- `mfaPending` / `mfaEnrollmentRequired` 会话**不得**在 session 输出中暴露完整授权能力。

并**分别落地到三处**，不能只靠 UI 隐藏：

- `app/admin/layout.tsx`：登录判断改为 `requireStaff()`，reader 进后台即 403/重定向。
- 后台各 page：按能力用对应守卫。
- **每个 Server Action**：`savePostAction`/`deletePostAction` 等入口从 `requireUser()` 换成 `requireStaff()`（及必要的 `requireEditor()`），因为 Action 可被直接 POST 调用。

### 10.1 审计（复用 `audit_logs`）
记录：注册、登录成功/失败、登出、改密、邮箱变更、角色变更、MFA 启停/重置、封禁/解封、账号注销。敏感事件带 IP + UA（`audit_logs` 已有字段）。

### 10.2 用户自助（`/account`）
资料（名/头像）、邮箱变更（需重新验证）、改密、已连接第三方（手动绑定，§4.3）、**活跃会话/设备列表 + 单独/全部登出**（§7.1）、**注销账号**（受 §11.2 外键约束）。敏感项走 step-up（§8）。

### 10.3 后台用户管理（`/admin/users`，`requireAdmin`）
用户列表（搜索 / 按角色 / 按状态）、改角色、启停（`disabledAt`，**同事务 bump `sessionVersion` 并失效 Redis**）、强制登出、发重置邮件、邀请员工、重置他人 MFA。impersonation 列为 v1 非目标。

---

## 11. 数据模型（Drizzle 增量）

### 11.1 表与列
**修复项（先做）**：`users.role` 默认 `author` → **`reader`**（`schema.ts:36`）。

`users` 扩展列：`emailVerified timestamptz`、`passwordChangedAt timestamptz`、`lastLoginAt timestamptz`、`mfaEnabled boolean`、**`sessionVersion int not null default 0`**（§7）、**`mfaRequiredAfter timestamptz`**（§8 宽限期，仅强制 MFA 角色使用）。

**邮箱规范化定案（评审修订——避开自定义 adapter 陷阱）**:标准 Auth.js DrizzleAdapter 的 `getUserByEmail()`/`createUser()` 按它认定的 **`users.email`** 查询,**不会**改查自定义的 `emailNormalized`;若把规范值放进 `emailNormalized`、让 adapter 继续查 `users.email`,语义又会不一致。定案取**更简可靠**的方案:

- **`users.email` 直接存 trim + lowercase 后的规范值**;唯一索引、标准 adapter、业务查询**全部继续用 `users.email`**——不引入 `emailNormalized`,无需重写 adapter。
- 若确有保留原始大小写展示的需求,另存可选列 **`emailDisplay`**(不参与唯一约束/查询);无此需求则连它都不要。
- （备选:坚持独立 `emailNormalized` 则**必须**采用自定义 adapter wrapper,并明确覆盖 `createUser` / `getUserByEmail` / `updateUser`——复杂度更高,非首选。）
- **迁移前必须扫描现有大小写碰撞**,冲突数据先人工处置再加唯一约束。

| 表 | 用途 | 关键列 |
|---|---|---|
| `accounts` | OAuth 绑定（adapter 标准） | `userId`, `provider`, `providerAccountId`(=`sub`/GitHub id), tokens；`(provider, providerAccountId)` 唯一 |
| `verification_tokens` | **仅留给 Auth.js adapter**（保持其固定语义/主键约定） | `identifier`, `token`, `expires` |
| `user_action_tokens` | **业务** token：邮箱验证/找回/换邮箱 | `userId`, `type`, `tokenDigest`, `expiresAt`, `consumedAt`, `createdAt` |
| `user_sessions` | 会话注册表(allowlist) / 活跃设备（§7、§7.1） | `jti`, `userId`, `createdAt`, `lastSeenAt`, `lastSeenWriteAt`, `expiresAt`, `ip`, `userAgent`, `deviceName`, `revokedAt` |
| `mfa_credentials` | TOTP | `userId`, `secretEnc`, `keyVersion`, `confirmedAt` |
| `mfa_recovery_codes` | 恢复码 | `userId`, `codeHash`, `usedAt` |
| `mail_outbox` | 发信 outbox（§6.6） | `template`, `recipient`, `payloadEnc`, `encryptionKeyVersion`, `status`, `attempts`, `nextAttemptAt`, `sentAt`, `redactedAt`, `lastError` |

> 按 §7 的 JWT 定案，`user_sessions` 作为会话注册表存在（配合 Redis），而非 Auth.js DrizzleAdapter 的 `sessions`。

### 11.2 账号注销与外键（已定案）
`posts.author_id` 为 `onDelete: "restrict"`（`schema.ts:73`）：**作者一旦发过文章就无法删除用户**。注销前必须先定：

**定案(默认取"软删除 + 匿名化",不做物理硬删除)**——理由:`posts.author_id` / `audit_logs.actorId` 等外键与线程完整性都需要主体记录仍在;硬删除会撞 RESTRICT 且断审计链。注销时把用户置为 **tombstone**:

| 主体 | 定案策略 |
|---|---|
| 用户本体(reader/author 同一处理) | 置 `disabledAt` + 新增 `deletedAt`;PII 匿名化:`name`→"已注销用户"、`image`→null、`passwordHash`→null、断开并删除 `accounts`(OAuth) 与 `user_sessions`;`email` 改写为 `deleted+<uuid>@invalid.local` **释放原邮箱唯一约束**(允许该人日后用同邮箱重新注册)。`users` 行**保留**(tombstone),不物理删。 |
| 认证凭据与待办 | 删除 `mfa_credentials`、`mfa_recovery_codes`、未消费的 `user_action_tokens`;取消该用户尚未投递的 outbox 任务并立即清理 `payloadEnc`，收件地址按留存策略删除或匿名化，避免注销后继续发出验证/找回邮件。 |
| 文章(author 有文章) | **保留文章**,`author_id` 仍指向 tombstone 行,前台署名渲染为"已注销用户";**不转移**到系统账号(转移会篡改历史归属)。 |
| 评论 | **保留内容**(线程完整性),`userId` 仍指向 tombstone;展示快照 `authorName`→"已注销用户"、`authorEmail`→占位(§11.3)。 |
| 审计记录 | `audit_logs` **不随注销删除**,`actorId` 指向 tombstone;保留期限待合规 ADR 定,技术上默认长期保留。 |

> 若未来合规要求"可被遗忘"到硬删除级别,再在独立合规 ADR 里加"硬删除 + 外键 `SET NULL`/转移系统账号"的升级路径;当前默认软删除已满足工程与展示需求。

### 11.3 `comments` 改造
**定案**:新增 `userId` 外键指向 `users`,**列可空**(`nullable`)——历史匿名评论 `userId` 为 null,但**新评论一律在应用层强制带 `userId`**,移除匿名写入路径。`authorName/authorEmail` **保留 `NOT NULL` 作为展示快照**:插入新评论时从当时的用户资料冗余写入(避免关联查询、且用户改名/注销后旧评论仍可独立展示)。注销时按 §11.2 把快照改写为"已注销用户"+ 占位邮箱。

时间戳沿用 ADR-0001 §7.2 的 UTC 约定。

---

## 12. 与 Cache Components 的关系（强制）

- 登录态页面（`/account`、后台、评论提交）**必须动态**（读 `cookies()`/`connection()` 退出预取缓存），**不得** `'use cache'`。
- 公共内容走 PPR；用户特定片段（"我是否已点赞"）走客户端组件或动态 slot，**绝不**把用户维度数据写进共享缓存标签。
- 会话/用户资料缓存只用 Redis 按用户键，与内容标签体系隔离。

---

## 13. 明确的坑（强制清单）

1. `users.role` 默认 `author` → `reader`（`schema.ts:36`）。
2. **后台鉴权只判登录**（`admin/layout.tsx:14` + `actions.ts:39`）——必须加 `requireStaff/Editor/Admin` 并落到布局、page、每个 Server Action（§10.0）。仅改角色默认值挡不住直接调 Action。
3. **Credentials + 数据库会话不兼容**（Auth.js `UnsupportedStrategy`）——采 JWT + 有状态会话注册表（§7）。
4. **撤销依赖有状态校验**：`disabledAt`/`sessionVersion`/`jti` 必须在**每次会话读取**时查，且封禁/改密同事务失效 Redis，Redis 校验 **fail-closed**——否则"立即失效"变延迟失效。
5. OAuth **不自动合并**同邮箱账号；Google 查 `email_verified`、GitHub 显式取 primary+verified 邮箱、均以 `sub`/id 为 provider 主键（§4.2/§4.3）。
6. 密码按 800-63B-4 **单因子最少 15 位、最大 ≥64**，**blocklist 必选**、zxcvbn 只提示、NFC 规范化；**argon2id 参数实机压测**防内存 DoS（§5）。
7. MFA 需区分完整会话、`mfaPending` 与 `mfaEnrollmentRequired`，并实现 `aal=2`、step-up、管理员宽限期、密钥 `keyVersion`、恢复码单次消费（§8）。
8. 业务 token 用 `user_action_tokens`，**不混用** Auth.js `verification_tokens`；消费用 `DELETE ... RETURNING` 原子化（§11.1）。
9. 邮件"只发不收"与"收退信"矛盾——默认 smarthost，退信走**上游回调/外部 bounce 邮箱**；只有可选直投升级才检查出站 25、PTR 与 IP 信誉（§6.4/§6.5）。
10. 注销受 `posts.author_id` RESTRICT 约束；采用 tombstone 软删除并匿名化，评论保留 `authorName/authorEmail` 展示快照且新评论必须带 `userId`（§11.2/§11.3）。
11. 基础设施真依赖是**HTTPS + Redis + 一条 SMTP 投递路径**(非"Docker"这一形态);Redis 已有用户态,smarthost 可免本机 Postfix。HTTPS 与投递路径是硬门禁(§0)。
12. **Seed 脚本回归**:`start.sh:49` 每次启动跑 `seed-admin.cjs`,bcrypt `ON CONFLICT DO UPDATE` 覆写密码,冲掉 argon2 迁移。两份 seed 改 argon2 + create-only + 独立重置命令(§5.1)。
13. **登录后路由**:`login/page.tsx:15` 无脑跳 `/admin`,reader 会撞 `requireStaff`。按角色路由 + 改文案(§4.4)。
14. **撤销窗口**:措辞改"最长 60s 窗口";零窗口需求直查 DB 不缓存(§7)。旧无 `jti` 的 JWT 上线时全失效重登(§7.1)。
15. **MFA-pending 提权**:守卫必须查 `aal=2`,不能只查角色(§10.0)。
16. **邮箱规范化**:`users.email` 直接存 trim+lowercase 规范值(不引入 `emailNormalized`),迁移前扫大小写碰撞(§11.1、见第 19 条)。
17. **发信 outbox**:注册事务内写 outbox,worker 重试,防"有账号无邮件"(§6.6)。
18. **验证链接不在 GET 消费**(防扫描器),**不硬锁账号**(防 DoS 受害者)(§6.1/§9)。
19. **邮箱规范化走标准 adapter**:`users.email` 直接存规范值,不引入 `emailNormalized`(否则须重写 adapter)(§11.1)。
20. **Outbox 不留明文 token**:`payloadEnc` 加密 + 投递后脱敏 + `lastError` 不含 URL(§6.6)。
21. **`requireUser()` 拒绝 `mfaPending` 与 `mfaEnrollmentRequired`**；二者分别只由 `requireMfaChallenge()`、`requireMfaEnrollment()` 接受。宽限期用 `mfaRequiredAfter`，敏感操作在宽限期内仍须 `aal=2`（§10.0/§8）。
22. **生产迁移空档**:`start.sh:36` 的 `.schema-v1` 门禁使 drizzle 迁移从不执行——P1 补 dump→migrate→校验→部署→失效会话→验收流程(§15.2)。

---

## 14. 合规（PIPL / UGC）—— 本设计不纳入

按 Owner 决定，合规不在本设计范围。**准确表述（修订）**：

> 本 ADR 只覆盖安全与账号工程基线，**不宣称完成 PIPL / UGC 合规**；在独立合规 ADR 完成前**不得开放公众注册与评论**。

注意：账号注销、日志/IP/UA 留存、OAuth 数据、评论审核、邮件退订都会**反向影响数据模型**（§10.1、§11.2、§11.3），故合规决策**并非**与技术实现完全独立——本设计已为这些点预留可调整的约束位。

---

## 15. 落地阶段

| 阶段 | 内容 | 产出可用能力 |
|---|---|---|
| **P-1 基础设施** | 落实 §0：HTTPS 终止路径、可信代理与源站隔离、Redis 可用性、域名/DNS 控制权 | 后续一切的前提 |
| **P0 发信底座** | 选定 smarthost + app SMTP transport + SPF/DKIM/DMARC + 退信/抑制通道 + transactional outbox worker；Postfix/OpenDKIM、出站 25、PTR 仅属可选直投升级 | 可靠发信 |
| **P1 账号地基** | schema 增量 + 默认角色修复 + **§10.0 角色守卫** + JWT+会话注册表（§7）+ 邮箱密码注册/验证/找回 + Redis 限流 | 公众可注册/登录/找回，后台鉴权收口 |
| **P2 社会化与会话管理** | GitHub/Google OAuth（§4.2/§4.3）+ `/account` 资料/改密/设备列表 | 一键登录、自助管理 |
| **P3 员工安全与后台** | TOTP MFA 状态机（§8）+ `/admin/users` + 审计完善 | 后台达安全基线 |
| **P4 加固** | CAPTCHA + HIBP + 按 §11.2 落地账号注销 | 抗滥用、注销闭环 |
| **P5（评论联动）** | `comments.userId` 改造（§11.3）+ 登录后评论 UI + 审核后台 | 登录用户评论 |

**顺序硬约束**：P-1 → P0 → P1。§10.0 角色守卫**必须与开放注册同批上线**（否则开放即提权）。P5 依赖 P1。

### 15.1 用开关解耦"部署"与"开放"（评审新增）
开头说"合规 ADR 完成前不得开放注册",但 P1 产出又写"公众可注册"——用**特性开关**消除这一矛盾:代码可在 P1 部署,但默认**关闭**。

```
PUBLIC_REGISTRATION_ENABLED=false   # 注册入口/接口整体开关
COMMENTS_ENABLED=false              # 评论开关
```

- 开关关闭时,**所有**注册入口、注册/OAuth 首次建号接口、评论接口一律 404/403(不只是隐藏 UI)。
- `COMMENTS_ENABLED` 是**部署级硬门禁**，现有数据库设置 `settings.commentsEnabled` 是**运营级软开关**；评论能力仅在二者同时为 `true` 时开放。环境门禁为 `false` 时，后台设置不得绕过它。
- **真正开放注册**必须同时满足:`P-1 基础设施` + `P0 邮件` + `P1 账号` + **`P3 MFA`** + `合规 ADR`。
- 强调 **P3 不能只写"后台暴露公网前完成"**:后台**现已实际部署上线**,所以在开放公众注册(意味着 reader 与 staff 共用同一登录面)之前,staff 的强制 MFA 必须已就位。

### 15.2 生产迁移与发布顺序（评审新增，P1 必须含）
**当前腾讯云根本没有跑迁移**:`infra/user-deploy/start.sh:36-40` 只在 **`.schema-v1` 标记不存在**时执行一次手写整库 `deploy/0000-schema.sql`;已上线机器该标记已存在,而仓库的 drizzle 迁移(`drizzle/*.sql` + `package.json` 的 `db:migrate`)在用户态部署里**从未被调用**。因此 §11 的 `reader`/`sessionVersion`/`accounts`/`mail_outbox` 等增量**不会自动生效**。

P1 必须补一套"生产迁移与发布"流程(写进部署脚本):

1. 迁移前自动 **`pg_dump`** 备份。
2. 执行**所有未应用**的 Drizzle migration(把 `db:migrate` 接入部署路径,不再靠 `.schema-v1` 一次性门禁)。
3. **校验**枚举值、新列、索引、约束确已生效(迁移后断言)。
4. 部署新应用二进制。
5. **轮换 JWT secret / 执行旧会话失效**(§7.1 的旧 JWT 全失效策略)。
6. 健康检查 + 登录验收(含一次真实 staff 登录)。
7. 失败时**应用层回滚**;数据库迁移**优先写成向前兼容**(加列可空、分两步收紧),避免直接 down migration 丢数据。

---

## 16. 明确排除项（v1 非目标）

- 企业 SSO / SAML / LDAP / OIDC-as-provider。
- 组织 / 团队 / 多租户隔离。
- 短信验证码登录。
- WebAuthn / Passkey（MFA 后续增强）。
- 细粒度自定义 RBAC / 权限编辑器（固定四角色足够）。
- 第三方身份代管（Auth0 / Clerk 等，与自托管冲突）。
- 数据库会话策略（因 Credentials 不兼容，改用 §7 的有状态 JWT）。

---

## 17. 安全验收测试（评审新增，硬要求）

项目**当前无任何测试脚本与认证测试**;本 ADR 引入的状态机太多,不能只靠手工验收。开放注册**之前**必须有自动化用例覆盖至少:

- reader **不能**访问任何 `/admin` 页面。
- reader 直接 POST 调用**所有**文章 Server Action(`savePostAction`/`deletePostAction`)均失败。
- reader **不能**调用 Markdown 预览——`renderMarkdownPreview`(`actions.ts:173`)当前 `requireUser()` 即放行,任何登录用户可触发最多 1MB Shiki 渲染,须收紧为 `requireStaff()`。
- author **不能**发布/定时/管理他人文章。
- 封禁、改密、角色变更使旧 JWT 失效(在撤销窗口内)。
- 单设备撤销只影响目标 `jti`,不误伤其它会话。
- MFA-pending 会话**无法**访问后台(§10.0)。
- `mfaEnrollmentRequired` 会话只能访问 MFA 绑定与退出端点，不能访问普通账号接口或后台。
- token 并发消费只有一个成功(§6.1 原子性)。
- 相同邮箱的 OAuth **不自动合并**(§4.3)。
- Redis 故障时会话校验**回源数据库**(§7 fail-closed)。
- `PUBLIC_REGISTRATION_ENABLED=false` 时所有注册入口与接口均不可用(§15.1)。
- `COMMENTS_ENABLED=false` 时，即使数据库 `settings.commentsEnabled=true`，评论入口与接口仍不可用（§15.1）。
