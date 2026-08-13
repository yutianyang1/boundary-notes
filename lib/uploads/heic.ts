import decodeHeic from "heic-decode";
import sharp from "sharp";

type Limits = { maxEdge: number; maxPixels: number };
type DecodedImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};
type DeferredImage = {
  width: number;
  height: number;
  decode(): Promise<DecodedImage>;
};
type DeferredImages = DeferredImage[] & { dispose(): void };

function validateDimensions(width: number, height: number, limits: Limits) {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > limits.maxEdge
    || height > limits.maxEdge
    || width * height > limits.maxPixels
  ) {
    throw new Error(`图片最长边不能超过 ${limits.maxEdge}px，且总像素不能超过 3000 万。`);
  }
}

/**
 * heic-decode exposes frame dimensions before allocating RGBA pixel buffers.
 * Every frame is checked first; only the primary frame is then decoded. sharp
 * encodes raw RGBA to WebP without carrying EXIF/GPS metadata forward.
 */
export async function convertHeicToWebp(bytes: Uint8Array, limits: Limits) {
  let images: DeferredImages;
  try {
    images = await decodeHeic.all({ buffer: bytes }) as unknown as DeferredImages;
  } catch {
    throw new Error("HEIC 文件损坏或不受支持。");
  }

  try {
    for (const image of images) {
      validateDimensions(image.width, image.height, limits);
    }
    const primary = images[0];
    if (!primary) throw new Error("HEIC 中没有可用的图像。");

    const decoded = await primary.decode();
    validateDimensions(decoded.width, decoded.height, limits);
    const output = await sharp(decoded.data, {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
      limitInputPixels: limits.maxPixels,
      failOn: "error",
    }).webp({ quality: 82 }).toBuffer();
    return { bytes: output, width: decoded.width, height: decoded.height };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("HEIC 解码失败。");
  } finally {
    images.dispose();
  }
}
