# Codex Spec:通用媒体库 / 文章图床

## 目标
让作者在写文章时能上传图片并在正文里引用。区别于现有的**头像**和**文章封面**(都是"绑在某条记录上的单张图"),媒体库是**一次上传、跨文章复用**的资产库:上传后进管理列表,能复制 Markdown/URL、能插入到编辑器、能删除。补上博客目前"正文无图床"的空白——这也是之前 mermaid 只能走服务端烘 SVG 绕开的那个坑。

## 现状(改动前必须先读,严格对齐,别另起炉灶)
现有两条上传路已经确立了全套约定,新图床**复用同一套**:

- **类型探测**:`lib/uploads/avatar.ts` 的 `detectAvatarType()` 用 magic byte 识别 jpeg/png/webp(**不信任扩展名/MIME**)。
- **尺寸/像素校验**:`lib/uploads/cover.ts` 的 `inspectCover()` 用 `image-size` 卡最长边和总像素。
- **存储**:`<UPLOADS_DIR>/<kind>/`(`UPLOADS_DIR` 未设时回退 `process.cwd()/uploads`),头像在 `avatars/`、封面在 `covers/`。
- **文件名**:`crypto.randomUUID() + . + 校验出的扩展名`,写盘用 `flag: "wx", mode: 0o640`(拒绝覆盖)。
- **服务路由**:`app/media/<kind>/[filename]/route.ts`,`filenamePattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/` 防目录穿越,Content-Type 由校验出的扩展名固定,响应头带 `Cache-Control: public, max-age=31536000, immutable` + `X-Content-Type-Options: nosniff`。
- **上传鉴权**:`app/api/admin/posts/cover/route.ts` 做了 origin==host 的 CSRF 校验 + `session.user.role !== "reader"` 才放行。
- **Markdown 侧**:`lib/markdown/render.ts` 的 sanitize schema **已放行** img 的 `alt/width/height/loading`,`![alt](/media/...)` 这类相对 URL 图片能正常渲染,**无需再动渲染管线**。

> 复用建议:把 `detectAvatarType` 提炼成共享的 `detectImageType`(或新建 `lib/uploads/image.ts` 放公共探测/类型表),avatar/cover/media 三处共用,避免拷贴三份 magic-byte 逻辑。重构要保持 avatar/cover 现有行为与测试不变。

## 安全红线(必须遵守)
1. **只接受 jpeg / png / webp**(与现有一致)。**绝不接受 SVG**——SVG 可内嵌脚本,是 XSS 面。可选支持 gif,但默认先不加。
2. 一律 **magic-byte 探测**,不信任客户端扩展名或 `Content-Type`。
3. 服务路由沿用 `filenamePattern` 白名单 + 固定 Content-Type + `nosniff`,防穿越、防 MIME 嗅探。
4. 上传/删除接口:origin==host 的 CSRF 校验 + 角色鉴权(见下)。
5. 大小上限(建议单图 ≤ 8 MB,与封面一致)、最长边/总像素上限(复用 `inspectCover` 的阈值)。
6. 写盘 `flag: "wx", mode: 0o640`;UUID 文件名不带任何用户可控字符串。

## 数据模型(这是与 cover 的关键差异)
封面是 posts 表的一个字段;媒体库需要**独立的资产表**才能"列出、复用、管理"。

新增 Drizzle 表 `media`(名字可斟酌),至少:

| 字段 | 说明 |
|---|---|
| `id` | uuid 主键 |
| `filename` | 存盘文件名(`<uuid>.<ext>`) |
| `url` | `/media/library/<filename>`(冗余存,便于列表直接用) |
| `mimeType` | `image/jpeg` 等 |
| `width` / `height` | 校验时得到,存下来供 `![]()` 带尺寸、防 CLS |
| `byteSize` | 字节数 |
| `title` / `alt` | 可空,作者可填(alt 供无障碍) |
| `uploadedBy` | 关联 users.id |
| `createdAt` | 时间戳 |
| `deletedAt` | 软删,可空 |

- 出一份 Drizzle migration。参考现有 schema/迁移风格。
- **存储 kind 用 `library`**:目录 `<UPLOADS_DIR>/library/`,服务路由 `app/media/library/[filename]/route.ts`。

## 接口
- `POST /api/admin/media`(上传):multipart,字段 `file`;鉴权 `role !== "reader"`;走探测+校验+写盘,插入 `media` 行,返回 `{ id, url, width, height }`。
- `GET /api/admin/media`(列表):分页,按 `createdAt desc`,过滤 `deletedAt is null`;供管理页/选择器用。
- `DELETE /api/admin/media/:id`(删除):软删(置 `deletedAt`)。**是否删物理文件见下方"引用与删除"权衡**。
- `PATCH /api/admin/media/:id`(可选):改 `title/alt`。
- `GET /media/library/[filename]`:公开静态服务,同 cover 路由。

**鉴权口径**:上传/列表/删除都要求登录且 `role !== "reader"`(editor+admin)。是否允许 editor 删除**别人**上传的资产,按现有 admin dashboard 里 `canSeeAllPosts = editor||admin` / `canSeeSystemData = admin` 的口径定:建议 editor 只能删自己上传的,admin 可删全部;列表同理(editor 看自己的,admin 看全部)。**请与现有权限模型对齐,不要新造一套。**

## 管理 UI(后台)
- 在后台加一个 **媒体库** 页(`app/admin/media/` 一类),网格展示缩略图 + 文件名/尺寸/大小/上传时间/上传者。
- 每张图操作:**复制 Markdown**(`![alt](url)`)、**复制 URL**、**删除**、(可选)编辑 alt/title。
- 上传区:拖拽或点选,多图上传更好;显示失败原因(类型/尺寸/大小)。
- **编辑器集成**:文章编辑器里加"插入图片"入口,打开媒体库选择器,选中后在光标处插入 `![alt](/media/library/<file>)`。若改动量大,一期可先只做独立媒体库页(上传+复制 Markdown),编辑器内联选择器留二期——**请在交付说明里注明做到哪一步**。

## 引用与删除(务必想清楚并写进 PR 说明)
文章 `contentHtml` 是**保存时预渲染入库**的,图片 URL 会被烘进 HTML。因此:
- 删除一张已被文章引用的图,正文会变裂图。
- 一期**建议软删 + 保留物理文件**(`deletedAt` 只是从库列表隐藏),避免误删打碎线上文章;物理清理留给后续的 GC 脚本(可扫描所有 `contentHtml` 找未被引用的 `library` 资产)。
- **不要**在删除时立即物理删文件,除非同时实现了引用检查。请在 PR 里说明选了哪种策略。

## 通用要求
- **响应式 & 主题**:管理页网格自适应;缩略图懒加载。
- **无障碍**:鼓励填 alt;插入的 Markdown 带上 alt。
- **不改渲染管线**:sanitize 已放行 img 相关属性,正文图片天然可渲染;若发现相对 URL 图片被 sanitize 掉,先确认原因再动 schema,并逐条说明安全依据。
- **测试**:为图片探测/校验、上传接口(合法通过、非法类型/超尺寸/超大小被拒、SVG 被拒、非 editor 被拒)、服务路由(合法返回、穿越文件名 404)各加用例;复用/重构 avatar 探测后,保证 avatar/cover 原有测试仍绿。
- `tsc --noEmit`、ESLint、生产构建、测试全绿。

## 验收标准
- [ ] editor/admin 能在后台上传 jpeg/png/webp,进媒体库列表。
- [ ] SVG、损坏文件、超大/超尺寸文件被拒,报错清晰。
- [ ] reader 或未登录无法上传/删除(403)。
- [ ] 复制出的 `![alt](/media/library/<uuid>.<ext>)` 粘进文章正文,前台文章页正常显示图片。
- [ ] 服务路由:合法文件名返回图片 + 正确 Content-Type + nosniff;非法/穿越文件名 404。
- [ ] 删除为软删,默认不打碎已引用该图的存量文章(或已实现引用检查,二选一并说明)。
- [ ] 权限口径与现有 admin 模型一致(editor 管自己的、admin 管全部)。
- [ ] `tsc`、lint、build、test 全绿。

## 交付说明(完成后附)
- 新增/重构了哪些文件;是否提炼了共享的 image 探测模块及对 avatar/cover 的影响。
- Drizzle migration 内容与执行方式。
- 编辑器集成做到哪一步(独立页 / 含内联选择器)。
- 删除策略(软删保留文件 / 引用检查后物理删)及理由。
- 新增依赖(若有)及体积。
