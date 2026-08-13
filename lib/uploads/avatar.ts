import { MAX_COVER_EDGE, MAX_COVER_PIXELS } from "./cover";
import { prepareUploadedImage, uploadDirectory } from "./image";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function prepareAvatar(bytes: Uint8Array) {
  return prepareUploadedImage(bytes, "avatars", {
    maxEdge: MAX_COVER_EDGE,
    maxPixels: MAX_COVER_PIXELS,
  });
}

export function avatarDirectory() {
  return uploadDirectory("avatars");
}

export function isManagedAvatarUrl(value: string | null | undefined) {
  return Boolean(value && /^\/media\/avatars\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/.test(value));
}
