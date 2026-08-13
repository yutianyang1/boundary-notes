import path from "node:path";
import createDOMPurify from "dompurify";
import { imageSize } from "image-size";
import { JSDOM } from "jsdom";

export const imageTypes = {
  jpeg: { extension: "jpg", contentType: "image/jpeg" },
  png: { extension: "png", contentType: "image/png" },
  webp: { extension: "webp", contentType: "image/webp" },
  avif: { extension: "avif", contentType: "image/avif" },
  gif: { extension: "gif", contentType: "image/gif" },
  svg: { extension: "svg", contentType: "image/svg+xml" },
} as const;

export type ImageType = keyof typeof imageTypes;
export type DetectedImageType = ImageType | "heic";
export type UploadImageKind = "avatars" | "covers" | "library";

const allowedInputTypes: Record<UploadImageKind, ReadonlySet<DetectedImageType>> = {
  avatars: new Set(["jpeg", "png", "webp", "avif", "heic"]),
  covers: new Set(["jpeg", "png", "webp", "avif", "heic", "svg"]),
  library: new Set(["jpeg", "png", "webp", "avif", "gif", "heic", "svg"]),
};

const kindLabels: Record<UploadImageKind, string> = {
  avatars: "头像",
  covers: "封面",
  library: "媒体库",
};

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function readFtypBrands(bytes: Uint8Array): string[] {
  if (bytes.length < 16 || Buffer.from(bytes.subarray(4, 8)).toString("ascii") !== "ftyp") {
    return [];
  }

  const declaredSize = (
    bytes[0] * 0x1000000
    + bytes[1] * 0x10000
    + bytes[2] * 0x100
    + bytes[3]
  );
  const boxSize = Math.min(bytes.length, Math.max(16, declaredSize));
  const brands = [Buffer.from(bytes.subarray(8, 12)).toString("ascii").toLowerCase()];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(Buffer.from(bytes.subarray(offset, offset + 4)).toString("ascii").toLowerCase());
  }
  return [...new Set(brands)];
}

function looksLikeSvg(bytes: Uint8Array) {
  try {
    const text = utf8Decoder.decode(bytes);
    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    return /^(?:<\?xml\b[\s\S]*?<svg\b|<svg\b)/i.test(normalized);
  } catch {
    return false;
  }
}

export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) return "jpeg";

  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "png";

  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "webp";

  if (bytes.length >= 6) {
    const signature = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") return "gif";
  }

  const brands = readFtypBrands(bytes);
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return "avif";
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "heic";

  if (looksLikeSvg(bytes)) return "svg";
  return null;
}

export function imageTypeDetails(type: ImageType) {
  return imageTypes[type];
}

function validDimensions(
  width: number | undefined,
  height: number | undefined,
  limits: { maxEdge: number; maxPixels: number },
): width is number {
  return Boolean(
    width
    && height
    && width <= limits.maxEdge
    && height <= limits.maxEdge
    && width * height <= limits.maxPixels,
  );
}

export function inspectImage(
  bytes: Uint8Array,
  limits: { maxEdge: number; maxPixels: number },
) {
  const type = detectImageType(bytes);
  if (!type || type === "heic" || type === "svg") return null;

  try {
    const dimensions = imageSize(bytes);
    if (!validDimensions(dimensions.width, dimensions.height, limits)) return null;
    return {
      ...imageTypeDetails(type),
      width: dimensions.width,
      height: dimensions.height!,
    };
  } catch {
    return null;
  }
}

function safeSvgReference(value: string) {
  const normalized = value.trim().replace(/\s+/g, "");
  return (
    normalized.startsWith("#")
    || /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(normalized)
  );
}

function sanitizeCss(css: string) {
  if (/@import|expression\s*\(|javascript\s*:|data\s*:(?!image\/(?:png|jpeg|gif|webp|avif))/i.test(css)) {
    return "";
  }
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote: string, value: string) => (
    safeSvgReference(value) ? match : "none"
  ));
}

export function sanitizeSvg(bytes: Uint8Array) {
  let source: string;
  try {
    source = utf8Decoder.decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("SVG 必须是有效的 UTF-8 文本。");
  }

  const window = new JSDOM("").window;
  try {
    const parser = new window.DOMParser();
    const parsed = parser.parseFromString(source, "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.localName.toLowerCase() !== "svg") {
      throw new Error("SVG XML 结构无效。");
    }

    const purify = createDOMPurify(window);
    const cleaned = purify.sanitize(source, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script", "foreignObject"],
      RETURN_DOM: false,
    });
    const sanitized = parser.parseFromString(cleaned, "image/svg+xml");
    const root = sanitized.documentElement;
    if (sanitized.querySelector("parsererror") || root.localName.toLowerCase() !== "svg") {
      throw new Error("SVG 消毒后不再包含有效的 svg 根节点。");
    }

    for (const element of Array.from(root.querySelectorAll("*")).concat(root)) {
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on")) {
          element.removeAttribute(attribute.name);
        } else if (name === "href" || name === "xlink:href" || name === "src") {
          if (!safeSvgReference(attribute.value)) element.removeAttribute(attribute.name);
        } else if (name === "style") {
          const safe = sanitizeCss(attribute.value);
          if (safe) element.setAttribute(attribute.name, safe);
          else element.removeAttribute(attribute.name);
        }
      }
    }
    for (const style of Array.from(root.querySelectorAll("style"))) {
      style.textContent = sanitizeCss(style.textContent ?? "");
    }

    const serialized = new window.XMLSerializer().serializeToString(root);
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(Buffer.from(serialized, "utf8"));
    } catch {
      throw new Error("SVG 必须提供 width/height 或 viewBox。");
    }
    if (!dimensions.width || !dimensions.height) {
      throw new Error("SVG 必须提供 width/height 或 viewBox。");
    }
    return {
      bytes: Buffer.from(serialized, "utf8"),
      width: dimensions.width,
      height: dimensions.height,
    };
  } finally {
    window.close();
  }
}

export type PreparedImage = {
  bytes: Uint8Array;
  extension: "jpg" | "png" | "webp" | "avif" | "gif" | "svg";
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/gif" | "image/svg+xml";
  width: number;
  height: number;
};

export type ImagePreparationResult =
  | { ok: true; image: PreparedImage }
  | { ok: false; error: string };

export async function prepareUploadedImage(
  bytes: Uint8Array,
  kind: UploadImageKind,
  limits: { maxEdge: number; maxPixels: number },
): Promise<ImagePreparationResult> {
  const type = detectImageType(bytes);
  if (!type) {
    return { ok: false, error: "无法识别图片内容，或文件已经损坏。" };
  }
  if (!allowedInputTypes[kind].has(type)) {
    return { ok: false, error: `${kindLabels[kind]}不支持 ${type.toUpperCase()} 格式。` };
  }

  try {
    if (type === "heic") {
      const { convertHeicToWebp } = await import("./heic");
      const converted = await convertHeicToWebp(bytes, limits);
      return {
        ok: true,
        image: {
          bytes: converted.bytes,
          extension: "webp",
          contentType: "image/webp",
          width: converted.width,
          height: converted.height,
        },
      };
    }

    if (type === "svg") {
      const sanitized = sanitizeSvg(bytes);
      if (!validDimensions(sanitized.width, sanitized.height, limits)) {
        return { ok: false, error: `图片最长边不能超过 ${limits.maxEdge}px，且总像素不能超过 3000 万。` };
      }
      return {
        ok: true,
        image: {
          bytes: sanitized.bytes,
          extension: "svg",
          contentType: "image/svg+xml",
          width: sanitized.width,
          height: sanitized.height,
        },
      };
    }

    const inspected = inspectImage(bytes, limits);
    if (!inspected) {
      return {
        ok: false,
        error: `图片已损坏、最长边超过 ${limits.maxEdge}px，或总像素超过 3000 万。`,
      };
    }
    return { ok: true, image: { bytes, ...inspected } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "图片处理失败。";
    return { ok: false, error: detail };
  }
}

export function uploadDirectory(kind: UploadImageKind) {
  const uploadsRoot = path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads"));
  return path.join(uploadsRoot, kind);
}

export const managedImageFilenamePattern = /^[0-9a-f-]{36}\.(jpg|png|webp|avif|gif|svg)$/;

export function contentTypeForExtension(extension: string) {
  if (extension === "jpg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  return null;
}

export function mediaResponseHeaders(extension: string) {
  const contentType = contentTypeForExtension(extension);
  if (!contentType) return null;
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    ...(extension === "svg"
      ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
      : {}),
  };
}
