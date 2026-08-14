/**
 * 标签 slug 从中文迁移到英文后，旧地址的 301 目标。
 *
 * 用静态映射而不是数据库表：这是一次性重命名，映射内容此后不再变化，
 * 而分类/标签没有后台改名入口。放在代码里可以在中间件里零查询完成跳转，
 * 也让「哪些地址搬过家」这件事可被 review。
 *
 * 旧地址必须继续可达：它们已进入 sitemap 并被收录，直接 404 会丢掉排名，
 * 站外既有链接也会断。
 */
export const TAG_SLUG_REDIRECTS: Record<string, string> = {
  推理优化: "inference-optimization",
  语音识别: "speech-recognition",
  大模型: "large-language-models",
  实时音频: "real-time-audio",
  归一化: "normalization",
  数字人: "conversational-avatars",
  残差连接: "residual-connections",
  注意力机制: "attention-mechanisms",
  深度学习: "deep-learning",
  深度网络: "deep-networks",
  热词: "hotwords",
  稀疏模型: "sparse-models",
  系统架构: "system-architecture",
  线性注意力: "linear-attention",
  长上下文: "long-context",
};

/**
 * 解析一个标签路径是否需要跳转，返回新路径或 null。
 *
 * 传入的 pathname 可能是已解码的中文，也可能是百分号编码的形式，
 * 两种都要能命中。
 */
export function resolveTagRedirect(pathname: string): string | null {
  const match = /^(\/(?:[a-z]{2}\/)?tags\/)(.+)$/.exec(pathname);
  if (!match) return null;

  const [, prefix, rawSlug] = match;
  // 只取第一段，避免把 /tags/x/y 这类路径误判。
  if (rawSlug.includes("/")) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSlug);
  } catch {
    // 非法的百分号编码：交给下游返回 404，不在这里猜。
    return null;
  }

  const target = TAG_SLUG_REDIRECTS[decoded];
  return target ? `${prefix}${target}` : null;
}
