import { prepareUploadedImage, uploadDirectory } from "./image";

export const MAX_COVER_BYTES = 8 * 1024 * 1024;
export const MAX_COVER_EDGE = 6_000;
export const MAX_COVER_PIXELS = 30_000_000;

export function inspectCover(bytes: Uint8Array) {
  return prepareUploadedImage(bytes, "covers", {
    maxEdge: MAX_COVER_EDGE,
    maxPixels: MAX_COVER_PIXELS,
  });
}

export function coverDirectory() {
  return uploadDirectory("covers");
}

export function isManagedCoverUrl(value: string | null | undefined) {
  return Boolean(value && /^\/media\/covers\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif|svg)$/.test(value));
}
