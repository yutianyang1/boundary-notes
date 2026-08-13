import {
  prepareUploadedImage,
  type ImagePreparationResult,
  uploadDirectory,
} from "./image";
import { MAX_COVER_EDGE, MAX_COVER_PIXELS } from "./cover";

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export type MediaValidationResult = ImagePreparationResult;

export async function validateMediaImage(bytes: Uint8Array): Promise<MediaValidationResult> {
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    return { ok: false, error: "图片不能超过 8 MB。" };
  }
  return prepareUploadedImage(bytes, "library", {
    maxEdge: MAX_COVER_EDGE,
    maxPixels: MAX_COVER_PIXELS,
  });
}

export function mediaDirectory() {
  return uploadDirectory("library");
}
