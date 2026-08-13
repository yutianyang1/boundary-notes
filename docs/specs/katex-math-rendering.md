# Codex Spec:给 Markdown 渲染管线加 KaTeX 数学公式

## 目标
`lib/markdown/render.ts` 目前没有数学渲染能力(无 remark-math / katex),作者只能把公式塞进代码块,渲染成等宽文本,很丑。加入 **remark-math + rehype-katex**,支持 `$...$`(行内)与 `$$...$$`(独立分式),服务端预渲染为 KaTeX HTML。

## 关键设计:rehype-katex 放在 sanitize **之后**
现有管线里 `rehypeServerMermaid`、`rehypeShiki` 都排在 `rehypeSanitize` **后面**——即"可信的服务端转换在安全边界之后运行,其生成的大量 span/class/style 不被白名单剥离"。KaTeX 输出同样含海量 span、MathML、内联 style,**照这个既有模式放在 sanitize 之后**,好处:

- **不需要**为 KaTeX 去放宽 `sanitizeSchema`(否则要放行一大堆 tag/class/style,还引入 `style` 注入面)。
- sanitize 之前,`remark-math` 产出的占位节点只是 `<span class="math math-inline">TeX</span>` / `<div class="math math-display">TeX</div>`,里面是纯文本 TeX。`span`/`div` 的 `className` **现有 schema 已放行**(render.ts:45–46),所以占位节点能安全穿过 sanitize;真正的 KaTeX 展开在其后进行。
- 作者是可信的站内 staff/admin,与 mermaid/shiki 的信任假设一致。

## 改动

### 1. 依赖
装 `remark-math`、`rehype-katex`、`katex`(与现有 unified/remark-rehype 版本匹配的最新;经验组合 `remark-math@6` + `rehype-katex@7` + `katex@0.16`)。

### 2. 管线(`lib/markdown/render.ts`)
- 在 remark 阶段,`remarkParse` 之后、`remarkRehype` 之前,`.use(remarkMath)`。
- 在 rehype 阶段,**`rehypeSanitize` 之后**(和 mermaid/shiki 同侧)`.use(rehypeKatex, { throwOnError: false, strict: "ignore" })`。
  - `throwOnError: false`:单条公式写错时输出错误样式而**不中断整篇渲染/保存**,与 v6 “mermaid 失败不阻断”的理念一致。
  - 具体排在 `rehypeServerMermaid` / `rehypeShiki` 之前或之后皆可(互不干扰:math 用 `$` 定界,不碰代码块/mermaid 围栏);建议放在 shiki 附近、stringify 之前。
- **不改 `sanitizeSchema`**(见上;若实测发现占位节点的 class 被剥再最小化放行)。

### 3. KaTeX 样式
KaTeX 依赖自带 CSS + 字体。全局引入一次:在 `app/globals.css` 顶部或根 layout `import "katex/dist/katex.min.css";`。
- 确认 KaTeX 的 woff2 字体在生产(standalone / nginx)下能正常加载,不被站点 CSP 拦截;必要时在 CSP 放行字体来源。
- 双主题:KaTeX 默认跟随 `currentColor`,确认亮/暗下公式颜色正常(通常继承正文色即可)。

### 4. 版本与回填
- `rendererVersion` **6 → 7**,并在注释追加一行:`v7: 加入 remark-math + rehype-katex 数学公式`。
- 部署后用现有 `scripts/rerender-posts.ts`(`npm run content:rerender`)按 `renderer_version` 批量重刷 `content_html`。**注意运行环境**:该库在 docker 网络内(`DATABASE_URL` 指向 `postgres`),重刷脚本需在 backend 网络内跑(tools 镜像),不能在主机直连。

## 边界与坑
- **误伤裸 `$`**:正文里孤立的 `$`(如价格 `$5`)可能被误当行内公式起始。`remark-math` 默认成对匹配,一般无碍;若担心可配置 `singleDollar` 相关选项。上线后扫一遍存量文章有没有裸美元符。
- **代码块内的 `$`**:remark-math 不解析代码块/行内代码里的 `$`,不受影响。
- 与 `remarkDirective`、`remarkGfm` 顺序无冲突;math 在 remarkParse 后尽早接入即可。

## 验收标准
- [ ] `$$ y = \gamma\frac{x-\mu}{\sqrt{\sigma^2+\varepsilon}}+\beta $$` 渲染为真正的分式+根号;行内 `$\mu$` 正常。
- [ ] 写错的公式(如未闭合)不使整篇渲染崩溃(`throwOnError:false` 生效)。
- [ ] 未改动 `sanitizeSchema` 的前提下,KaTeX 输出完整未被剥离(占位节点穿过 sanitize、KaTeX 在其后展开)。
- [ ] KaTeX CSS/字体在开发与生产都加载,公式在亮/暗主题下都清晰。
- [ ] `rendererVersion` 升到 7;跑重刷脚本后,存量文章(含 mermaid/代码高亮的)输出无回归。
- [ ] 无 XSS 回归:普通作者输入的 HTML 仍被 sanitize;仅 KaTeX 生成物豁免(与 mermaid/shiki 同等信任)。
- [ ] `tsc --noEmit`、ESLint、`next build`、`node --test` 全绿。

## 交付说明
- 新增依赖与版本;管线插入位置(尤其 rehype-katex 相对 sanitize 的次序);CSS 引入位置;是否动过 sanitizeSchema(预期否)。
- 重刷脚本在何处/如何运行(docker 网络内)。

## 后续(内容侧,我来做)
KaTeX 落地后,我会把已发布的《BatchNorm/LayerNorm/GroupNorm》那篇里代码块形式的公式改成 `$$...$$`(含 `\mu`、`\sigma^2` 等正规下标),并重刷该文。**在渲染器支持之前不要改文章**,否则 `$` 会原样显示。
