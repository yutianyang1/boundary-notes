# Codex Spec:认证四页(登录/注册/验证邮箱/账户中心)视觉改版

## 目标
把 `/login`、`/register`、`/verify-email`、`/account` 四页从"素卡片"升级到与全站一致的视觉语言。前三页(未登录、单一焦点)统一为**左右分栏**:左侧深色品牌板 + 右侧表单;账户中心(登录后仪表盘)保持 `.shell` 左对齐,只做卡片化美化。方向由 mock 敲定,参考 `docs/design/auth-redesign.html`。

## 硬约束
- 暗色走 `.dark`(next-themes),**不要** `prefers-color-scheme`;复用现有 token(`--primary`/`--accent`/`--warm`/`--shadow`/`--radius-card`/`--hairline`)与 `.shell`(勿改 100rem)。
- **所有现有业务逻辑与安全行为保持不变**,本次以表现层为主 + 一处注册字段增强(见 §4)。具体不得破坏:
  - `/login`:已登录用户按角色重定向(reader→`/account`,其余→`/admin`);登录失败文案"邮箱或密码不正确。请检查后重试。"。
  - `/register`、`/verify-email`:`isPublicRegistrationEnabled()` 关闭时 `notFound()`;verify 无 token 或 token 过短 `notFound()`(防邮件扫描器预取)。
  - `registerAction` 的**邮箱枚举防护**:邮箱已存在时返回与成功**一致**的模糊提示("如果该邮箱可用,验证邮件将会发送"),**不得**因改版泄漏"该邮箱已注册"。
  - `/account`:会话列表、当前设备判定、下线/退出其他设备、头像上传(`/api/account/avatar`)、改密后保留当前设备等全部保留。
- **不虚构不存在的流程**:当前没有"忘记密码/找回密码",**不要**加该入口或死链;OAuth 同理,没有就不画。

## 结构与实现

### 0. 共享分栏骨架(新组件)
- 新增 `components/auth/auth-split.tsx`(或同类):`<AuthSplit brand={…} children>`,左品牌板 + 右表单两栏,`≥860px` 分栏、窄屏堆叠(品牌板退成顶部横条,不喧宾夺主)。
- **左品牌板复用 `GeneratedCover` 的 `patternOnly` 模式**(关于页已加,别再拷第四份图版):panel 为 `relative` 容器,`GeneratedCover ... patternOnly className="absolute inset-0"` 作背景,其上叠 `BrandMark` + eyebrow + 大标题 + 可选要点列表。**品牌板在明暗两个主题下都是深色**(它是"封面"表面),板内文字恒为浅色,不随主题反转。
- 标题里的关键词用暖色下划线高亮(`linear-gradient(transparent 60%, color-mix(in oklch, var(--warm) …) 60%)`),和关于页 Hero 一致。
- 每页的品牌板文案(eyebrow / 标题 / 要点)由页面传入;mock 里的是示例文案,作者可自填。

### 1. 登录 `/login`
- 用 `AuthSplit`。右侧沿用现有 `LoginForm`(`app/login/login-form.tsx`)逻辑,仅换外壳与字段样式(eyebrow「内容工作台」+ 标题「登录」+ lede)。
- 字段:邮箱(`autoComplete="username"`)、密码(`current-password`);焦点态主色描边 + 光环(见 mock `.field input:focus`)。
- 错误态用红色 `alert` 呈现(现有文案不变)。
- 底部交叉链接「还没有账号?去注册」——**仅当 `isPublicRegistrationEnabled()` 为真时渲染**(该判断在服务端页面组件里做,把布尔传给表单或直接条件渲染链接)。

### 2. 注册 `/register`
- 用 `AuthSplit`。右侧字段顺序:昵称 → 邮箱 → 密码 → **确认密码**。
- 密码框下保留提示「至少 15 个字符」;mock 里的强度条为可选增强(如实现,纯前端、`aria-hidden`,不作为唯一校验)。
- **成功/错误分色**:现有 `RegisterState` 有 `status: "success" | "error"`。用它区分——`error` 红色 `alert`,`success` 绿色 `alert`(现在的实现把两者都渲染成同一段灰字,改掉)。
- 底部交叉链接「已有账号?去登录」。

### 3. 验证邮箱 `/verify-email`
- 用 `AuthSplit`。右侧为居中确认块:邮件图标 + 标题「验证邮箱」+ 说明「点击按钮后才会完成验证,邮件扫描器打开此页面不会消耗链接。」+「确认验证」按钮(现有 `verifyEmailAction` + 隐藏 `token` 不变)。
- 左品牌板文案偏"最后一步 / 激活账号"。

### 4. 功能增强:注册"确认密码"(前端 + 服务端都要)
- **前端**(`register-form.tsx`):新增 `confirmPassword` 字段,`type="password"` `autoComplete="new-password"` `required minLength={15}`。
- **服务端**(`app/register/actions.ts`):
  - `inputSchema` 增加 `confirmPassword: z.string()`,并加**一致性校验**(zod `.refine`/`.superRefine` 判 `password === confirmPassword`,失败信息如「两次输入的密码不一致」)。校验发生在 zod 解析阶段,即**在任何 DB 操作、邮件入队之前**。
  - 不一致时返回 `{ status: "error", message: "两次输入的密码不一致" }`。
  - **务必保持邮箱枚举防护不变**:一致性/格式/弱密码校验失败可返回明确错误(这些不泄漏账户是否存在);但"邮箱是否已注册"仍只能返回模糊成功提示。顺序:先跑 schema(含一致性)→ 弱密码检查 → 再查库/建号。
- 若为该字段加/改测试,放到既有测试目录并保持 `node --test` 可跑。

### 5. 账户中心 `/account`(不分栏,仪表盘)
- 保持 `.shell` 左对齐与现有信息架构(头部 / 个人资料 / 修改密码 / 登录设备),**只做卡片化美化**:
  - 卡片统一 `rounded-[var(--radius-card)] border bg-card [box-shadow:var(--shadow)]`。
  - 头部:头像(有上传用上传、无则首字母 `conic-gradient(primary→warm)` 圆底,和文章页 byline 一致)+ 名字 + 邮箱 + **角色 chip**(用 `--accent`);右侧「返回后台/首页」+「退出登录」。
  - 登录设备:每行设备名 + "当前设备"绿色徽标(`--ok` 系)、最近活动/IP/到期(`tabular-nums`)、非当前行「下线」;顶部「退出其他设备」(无其他会话时 `disabled`,现有逻辑保留)。
- 现有 `AvatarForm`/`ProfileForm`/`PasswordForm`/`RevokeDeviceForm`/`RevokeOthersForm` 的行为、成功/错误消息(`role="status"`/`role="alert"`)、`disabled` 态一律保留,只调样式。

## 通用要求
- 亮/暗双主题协调(`.dark`);`prefers-reduced-motion` 关过渡。
- 键盘 focus 可见(现有 `focus-visible:ring` 风格);表单 `label` 与 `input` 正确关联;`autoComplete` 保留/补全。
- body 不横向溢出;分栏窄屏正确堆叠;品牌板在超宽屏不拉伸失真。
- 密码框不得回显明文(不加"显示密码"除非另行要求)。

## 验收标准
- [ ] 登录/注册/验证三页为左右分栏,品牌板复用 `GeneratedCover patternOnly`(未拷新图版)、明暗都深色;窄屏正确堆叠。
- [ ] 登录「去注册」入口仅在注册开放时出现;注册/验证在注册关闭时仍 `notFound()`;verify 无/短 token 仍 `notFound()`。
- [ ] 注册新增"确认密码":前端 required,服务端一致性校验在建号前;不一致返回明确错误;**邮箱已存在仍返回模糊成功提示**(枚举防护未被破坏)。
- [ ] 注册成功/错误分色显示(绿/红),不再统一灰字。
- [ ] 账户中心保持左对齐仪表盘与全部原有会话/头像/改密逻辑,仅样式卡片化;角色 chip、当前设备徽标呈现正常。
- [ ] 登录失败文案、重定向角色分流、改密后设备处理等原行为不变。
- [ ] 亮/暗正常;`tsc --noEmit`、ESLint、build、`node --test` 全绿。

## 交付说明
- 新增/改动文件清单;共享分栏组件命名与位置;品牌板复用 `GeneratedCover` 的方式。
- 注册"确认密码"服务端校验的实现点(schema `refine` 的位置)与如何确认枚举防护未回退。
- 若新增/调整了测试,列出用例。
