# 边界笔记 Android

Kotlin + Jetpack Compose 原生客户端，包名 `site.xiudou.boundarynotes`，最低 Android 8。文章 Markdown 用原生 TextView/Markwon 渲染，不加载站点 WebView。

## 构建

需要 JDK 17、Android SDK 36、Build Tools 35.0.0、Gradle 8.13。本机使用：

```sh
. /home/yty/.config/android/env.sh
cd /home/yty/boundary-notes/android
gradle assembleDebug
```

仓库提供标准 Gradle Wrapper，其他机器安装 JDK/SDK 后也可运行 `./gradlew assembleDebug`。Wrapper 固定 Gradle 版本并校验下载包 SHA-256。

APK：`app/build/outputs/apk/debug/app-debug.apk`。Android Studio 可直接打开本目录。

## 接口与会话

默认站点 `https://xiudou.site`，在 `app/build.gradle.kts` 的 `SITE_URL` 中配置。需要先发布新增的 `/api/mobile/posts` 和 `/api/mobile/posts/[slug]` 接口：20 条分页，搜索标题与摘要，仅返回公开文章。账号、好友与聊天复用现有站点接口、登录限流和会话撤销。

Cookie 由 Android Keystore AES-GCM 加密保存，不保存密码。退出会撤销服务端会话并清除本机 Cookie，应用禁止系统备份。

## 已实现

- 0.3.0 统一网站视觉：同款蓝色、明暗色板、8dp 控件/14dp 卡片、品牌阶梯标记、标题分级与分隔线；手动主题切换保存在本机。
- 文章封面、按网站相同哈希选取的六种生成封面、分类/日期/阅读时长；真实头像与渐变首字兜底。
- 消息页分为会话、好友、通知；好友分组、聊天气泡、登录/注册/MFA 与管理员通知表单统一样式。
- 原生个人资料卡：系统图片选择器更新头像（最大 2 MB）、修改昵称；复用网站资料更新和头像处理，改密继续通过邮箱。
- 原生文章列表、搜索、分页、Markdown 阅读与系统分享。
- 邮箱密码登录、验证器/恢复码二次验证、登录状态恢复、退出。
- 原生邮箱注册：发送验证邮件、App Links 返回或粘贴链接验证、设置昵称密码；遵循服务端注册开关、冷却和一次性令牌。
- 好友分组新建、改名、删除、移动与昵称搜索；分组按账号在网页和 App 同步。
- 消息仅在前台对应会话的最新消息可见后确认已读，关闭窗口、切换页面和浏览历史不清除新消息提醒。公告需单独确认。
- 好友与会话列表、未读数、最近 50 条消息、发送与已读同步。
- 好友搜索/申请与接受/拒绝申请、公告标记已读。
- 管理员群发站内通知（需二次确认，后台继续校验管理员权限）。
- 公告展示、系统深色模式。前台消息页每 8 秒刷新，其余页面每 20 秒更新未读数，后台停止轮询。

## 当前限制

GitHub OAuth、首次绑定验证器、评论、系统推送、离线文章下载以及复杂公式/图表暂未覆盖。历史消息翻页需要增加后台接口。原生 App 使用站点的 assetlinks 关联邮箱验证链接；也可手动粘贴链接完成验证。更换正式签名时需同步更新 assetlinks 中证书指纹。改密通过现有邮箱重置流程完成，个人中心不提供直接改密接口。

2026-11-04 验证：`assembleDebug`、`lintDebug`、APK 签名验证和 16 KB ZIP 对齐检查均通过；后台 TypeScript、ESLint 和 Next.js 生产构建通过。Lint 仍有依赖更新建议等非阻断警告。调试 APK 约 11 MB，尚未真机联调。

2026-11-04 已发布文章与二次验证接口，线上版本为 `native-android-20261104`。备用端口与正式服务均通过文章、匿名权限、请求来源、原有 SSO、APK 哈希检查；公开 HTTPS 下载与 App 文章接口已核验。

手机下载安装包：[边界笔记 0.3.0 调试版](https://xiudou.site/downloads/boundary-notes-0.3.0.apk)。真实设备的邮件跳转、登录、二次验证和聊天交互仍需真机联调。

可选原生截图测试：`gradle -PsiteScreenshots=true testDebugUnitTest --tests '*SiteAppearanceTest'`。依赖 Robolectric 的 Android 35 和原生渲染库，首次下载较大；图片输出到 `app/build/site-previews`。普通构建和单元测试不依赖这个环境。本次截图环境下载未完成，不代表已真机验收。

2026-11-05：0.3.0 的 `assembleDebug`、单元测试（链接验证与网站封面哈希一致性）、`lintDebug`、APK 签名与 16 KB ZIP 对齐检查通过；Lint 保留依赖更新、KTX 建议等警告。
