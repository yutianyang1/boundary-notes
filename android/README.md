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

- 原生文章列表、搜索、分页、Markdown 阅读与系统分享。
- 邮箱密码登录、验证器/恢复码二次验证、登录状态恢复、退出。
- 好友与会话列表、未读数、最近 50 条消息、发送与已读同步。
- 好友搜索/申请与接受/拒绝申请、公告标记已读。
- 管理员群发站内通知（需二次确认，后台继续校验管理员权限）。
- 公告展示、系统深色模式。前台消息页每 8 秒刷新，其余页面每 20 秒更新未读数，后台停止轮询。

## 当前限制

GitHub OAuth、首次绑定验证器、注册、评论、系统推送、离线文章下载以及复杂公式/图表暂未覆盖。历史消息翻页需要增加后台接口。PWA 文件属于网站可选功能，原生 App 不依赖 TWA 或 assetlinks。二次验证还需部署 `/api/mobile/mfa`，该接口复用网站原有校验、限流、恢复码消费与审计逻辑。

2026-11-04 验证：`assembleDebug`、`lintDebug`、APK 签名验证和 16 KB ZIP 对齐检查均通过；后台 TypeScript、ESLint 和 Next.js 生产构建通过。Lint 仍有依赖更新建议等非阻断警告。调试 APK 约 11 MB，尚未真机联调。

2026-11-04 已发布文章与二次验证接口，线上版本为 `native-android-20261104`。备用端口与正式服务均通过文章、匿名权限、请求来源、原有 SSO、APK 哈希检查；公开 HTTPS 下载与 App 文章接口已核验。

手机下载安装包：[边界笔记 0.1.0 调试版](https://xiudou.site/downloads/boundary-notes-0.1.0.apk)。真实账号登录、二次验证和聊天交互仍需真机联调。
