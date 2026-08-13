# Codex Spec:扩展图片格式支持(AVIF / GIF / HEIC / SVG)

## 背景
当前封面、正文插图、头像**统一只收 JPEG / PNG / WebP**,靠魔术字节嗅探(`lib/uploads/image.ts` 的 `detectImageType`),**上传后不转码、原样存原图**。依赖里没有 `sharp`,只有纯 JS 的 `image-size`。

目标:把可上传格式扩到 **AVIF + GIF + HEIC + SVG**,并按用途分级放行,同时守住两条安全底线——**HEIC 解压炸弹** 与 **SVG XSS**。

> 分工:本文交 Codex 实现,Claude 审查。实现完成后**必须跑 `/security-review`**(涉及上传校验、原生转码、SVG 消毒)。

---

## 1. 格式矩阵(按用途分级 —— 服务端强制,不能只靠 `accept=`)

| 用途 (`kind`) | 允许上传的输入格式 | 存储格式 |
|---|---|---|
| 头像 `avatars` | JPEG, PNG, WebP, AVIF, **HEIC** | 原格式;HEIC→WebP |
| 封面 `covers` | JPEG, PNG, WebP, AVIF, **HEIC**, **SVG** | 原格式;HEIC→WebP;SVG 消毒后存 |
| 正文/媒体库 `library` | JPEG, PNG, WebP, AVIF, **GIF**, **HEIC**, **SVG** | 原格式;HEIC→WebP;SVG 消毒后存 |

规则:
- **HEIC 是"仅输入"格式**:浏览器不认,一律**服务端转码成 WebP** 再存;`.heic` 永不落盘、永不直供。因此**存储格式恒在 `{jpg,png,webp,avif,gif,svg}` 内**。
- **GIF 只给正文/媒体库**(动图封面/头像无意义)。
- **SVG 不给头像**(头像是人像照片场景)。
- 三个用途各自的 `accept=` 与服务端 `kind` 白名单要**一致且由服务端兜底**(客户端 `accept` 只是体验,真正拦截在服务端)。

---

## 2. 类型识别(`lib/uploads/image.ts`)

### 2.1 AVIF / HEIC —— 必须靠 ftyp brand 精确区分
AVIF 与 HEIC 同为 ISOBMFF,都以 `....ftyp` 开头(第 4–8 字节 ASCII = `ftyp`)。**只看 ftyp 不够,必须解析 brand 列表**,否则会把无法显示的 HEIC 误判成 AVIF。

实现一个辅助:`readFtypBrands(bytes): string[]`
- 前 4 字节大端 = ftyp box 长度 `boxSize`(夹到 `[16, bytes.length]`)。
- 第 4–8 字节确认为 `ftyp`,否则返回 `[]`。
- **major brand** = 第 8–12 字节;**compatible brands** = 从第 16 字节起、每 4 字节一个,直到 `boxSize`。全部小写收集。

判定:
- **AVIF**:brand 集合含 `avif` 或 `avis`。
- **HEIC**:brand 集合含 `heic` / `heix` / `heim` / `heis` / `hevc` / `hevx` / `mif1`(且不含 avif/avis)。
- 两者都不含 → 非本类。

> `detectImageType` 现返回 `ImageType | null`。新增识别结果:`"avif"`、`"gif"`、`"svg"`、`"heic"`。**注意 `heic` 是"待转码"标记,不是最终存储类型**——见 §3。

### 2.2 GIF(存原图)
前 6 字节 ASCII == `GIF87a` 或 `GIF89a`(即 `GIF8` + `7`/`9` + `a`)。

### 2.3 SVG(文本嗅探 + 解析验证)
SVG 是文本,不能靠固定魔术字节:
- 跳过可选 UTF-8 BOM 与前导空白,内容以 `<?xml` 或 `<svg`(大小写不敏感)开头,且整体含 `<svg` 标签 → 判为候选 SVG。
- 仅"候选"不算通过,真正验证放在消毒阶段(§4)——消毒解析失败即拒。

### 2.4 尺寸与限制
- `image-size` v2 能读 AVIF / GIF / SVG 尺寸;沿用 `inspectImage` 的 `maxEdge=6000` / `maxPixels=3e7`。
- SVG 若 `image-size` 读不出宽高(无 `width/height` 也无 `viewBox`)→ **拒绝**,提示作者补 `viewBox`。
- HEIC 的尺寸检查见 §3(要在**解码前**用元数据挡住解压炸弹)。

---

## 3. HEIC 转码(系统 libheif + `sharp`)

> **勘误(实现阶段修正)**:原文"sharp 预编译包自带 libheif 解码"**不准确**。sharp 官方说明(https://sharp.pixelplumbing.com/api-output/)指出 HEVC 解码需要定制 libvips,预编译包**不含**。实际实现改为:**Docker 装系统 `libheif-tools`**,用 `heif-info` 读元数据 + `heif-dec` 解码为 PNG,再由 `sharp` 转 WebP 并剥除 EXIF。

- 新依赖 **`sharp`**(转 WebP + 剥 EXIF)+ 系统包 **`libheif-tools`**(HEIC 解码,Dockerfile 构建/运行两阶段都要装)。
- 流程(在服务端校验层,检测为 `heic` 时):
  1. `const img = sharp(bytes, { limitInputPixels: MAX_COVER_PIXELS, failOn: "error" })` —— `limitInputPixels` 挡**解压炸弹**。
  2. `const meta = await img.metadata()`;先按 `meta.width/height` 校验 `maxEdge` / `maxPixels`,**超限直接拒,不做完整解码**。
  3. `const out = await img.webp({ quality: 82 }).toBuffer()` —— 默认**不带 `withMetadata()`**,自动**剥离 EXIF/GPS**(隐私)。
  4. 以 WebP 落盘:`extension:"webp"`,`contentType:"image/webp"`,尺寸取转码后的宽高。
- Docker:`next` 镜像在 linux 内构建,sharp 会装 linux 原生二进制;**加完依赖需重建 `next` 镜像**。standalone 输出要确保 `node_modules/sharp` 及其平台二进制进入 runner(必要时在 runner 阶段 `npm i sharp` 或复制)。

---

## 4. SVG 消毒(引入服务端消毒器)+ 安全直供

**svgo 是优化器,不是安全消毒器,不能拿来防 XSS。** 用 **DOMPurify + jsdom**(如 `isomorphic-dompurify`,或 `dompurify` + `jsdom`)在服务端消毒:
- 配置 `USE_PROFILES: { svg: true, svgFilters: true }`;强制移除 `<script>`、`<foreignObject>`、所有 `on*` 事件属性、`javascript:`/`data:`(非图像)URL、外部引用(`xlink:href` 指向外部)。
- 消毒**解析失败或结果不含 `<svg>`** → 拒绝。
- **存消毒后的文本**(不是原始上传字节),扩展名 `.svg`,`contentType:"image/svg+xml"`。

**安全直供**(`app/media/*/[filename]/route.ts`,对 `.svg`):即便已消毒也要纵深防御,因为直接访问 `/media/.../x.svg` 会当文档渲染。响应头:
- `Content-Type: image/svg+xml`
- `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`
- `X-Content-Type-Options: nosniff`

> 正文里 SVG 以 `![](/media/library/x.svg)` → `<img src>` 引用,`<img>` 本身已中和脚本;上面的头是针对"直接打开 URL"的额外防线。Markdown sanitize(`lib/markdown/render.ts`)**无需改动**——我们不放行内联 `<svg>` 标记,只放行 `<img>` 引用,而 `<img>` 已在默认 schema 内。

---

## 5. 逐文件改动清单

**核心校验 `lib/uploads/image.ts`**
- `imageTypes` 增 `avif`(`.avif`,`image/avif`)、`gif`(`.gif`,`image/gif`)、`svg`(`.svg`,`image/svg+xml`)。**不含 heic**(heic 不是存储类型)。
- `detectImageType`:加 §2 的 AVIF(ftyp brand)/ GIF / SVG / HEIC 识别;HEIC 返回独立标记供上层转码。
- `contentTypeForExtension`:加 `avif` / `gif` / `svg`。
- `managedImageFilenamePattern`:`/^[0-9a-f-]{36}\.(jpg|png|webp|avif|gif|svg)$/`。

**`lib/uploads/cover.ts`**
- `isManagedCoverUrl` 正则:`(?:jpg|png|webp|avif|gif|svg)`(注意:封面不允许 gif,但正则可放宽到统一存储集;真正的用途拦截在上传层)。实际按 §1,封面存储集是 `{jpg,png,webp,avif,svg}`——正则用这个更精确。

**`lib/uploads/media.ts`**
- `MediaValidationResult` 的 `extension`/`contentType` 联合类型扩到全存储集。
- 改掉错误文案里"不接受 SVG"的表述。
- 校验改为**接受新格式 + 触发 HEIC 转码 / SVG 消毒**,并按 `kind` 应用 §1 白名单。

**上传 API(3 个,加 `kind` 白名单 + 转码/消毒调用)**
- `app/api/account/avatar/route.ts`(`avatars`)
- `app/api/admin/media/route.ts`(`library`)
- `app/api/admin/posts/cover/route.ts`(`covers`)

**媒体直供路由(3 个,扩 ext→mime + SVG 加固头)**
- `app/media/avatars/[filename]/route.ts`
- `app/media/covers/[filename]/route.ts`
- `app/media/library/[filename]/route.ts`

**上传组件 `accept=`(按 §1 分级)**
- `app/(site)/account/account-forms.tsx`:`image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif`
- `components/admin/cover-uploader.tsx`:上面 + `image/svg+xml`(不含 gif)
- `components/admin/media-library.tsx`:全部 + `image/gif` + `image/svg+xml`

**预览/渲染**
- 检查 `cover-uploader.tsx` / 媒体库缩略图预览:若用 `next/image` **optimized** 渲染,SVG 会报错;预览一律用**普通 `<img>` 或 `unoptimized`**。封面在页面上本来就是 `unoptimized`,不受影响。
- `next.config` 无需为此加 `images` 配置(封面/正文均非 next/image 优化路径)。若将来要优化 SVG 才需 `dangerouslyAllowSVG`——本次不做。

---

## 6. 测试(扩展现有 `lib/uploads/*.test.ts`)
- `detectImageType`:AVIF(major brand `avif`)、AVIF(仅 compatible brand 含 `avif`)、**HEIC(brand `heic`)必须识别为 heic 而非 avif**、GIF87a/89a、SVG(`<svg>`)、伪装(`.png` 扩展名但内容是别的)→ 按内容判定。
- HEIC 路径:给一张小 HEIC → 断言落盘为 `.webp`、EXIF 被剥。
- SVG 消毒:含 `<script>`/`onload=` 的 SVG → 断言输出已移除;无 `viewBox`/尺寸的 SVG → 拒绝。
- `isManagedCoverUrl` / `managedImageFilenamePattern`:新扩展名通过、`.heic` 不通过。
- `tsc --noEmit` 通过、`eslint .` 无新增报错。

## 7. 验收清单
- [ ] 三个用途各按 §1 矩阵放行;服务端对越权格式(如给头像传 SVG)返回明确 4xx,不落盘。
- [ ] HEIC 上传后存为 WebP 并正常显示;超大 HEIC 被 `limitInputPixels` 挡住,不 OOM。
- [ ] AVIF / GIF 原样存储并正常显示;HEIC 绝不被误判为 AVIF。
- [ ] SVG 经消毒后存储;含脚本/事件的 SVG 被净化;直供响应带 CSP `sandbox` + `nosniff`。
- [ ] 媒体库"复制 Markdown"对新格式生成正确 `![](...)`。
- [ ] 加 `sharp` 后 `next` 镜像重建通过,生产 standalone 能加载 sharp。
- [ ] 跑完 `/security-review` 无未处理高危项。

## 8. 不做(本次范围外)
- HEIC/SVG 的 `next/image` 优化管线(`dangerouslyAllowSVG` 等)。
- 把现有 JPEG/PNG 统一转码归一化(保持"存原图");仅 HEIC 转码、仅 SVG 消毒。
- 动图 GIF 转 WebP/视频。
