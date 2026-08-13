import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { isManagedAvatarUrl, prepareAvatar } from "./avatar";

test("accepts AVIF avatars and blocks SVG/GIF", async () => {
  const avif = await sharp({ create: { width: 2, height: 2, channels: 4, background: "blue" } })
    .avif()
    .toBuffer();
  const accepted = await prepareAvatar(avif);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.image.extension, "avif");

  for (const bytes of [
    Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>"),
    Buffer.from("GIF89a", "ascii"),
  ]) {
    const rejected = await prepareAvatar(bytes);
    assert.equal(rejected.ok, false);
  }
});

test("managed avatar URLs include AVIF but never HEIC", () => {
  assert.equal(isManagedAvatarUrl("/media/avatars/550e8400-e29b-41d4-a716-446655440000.avif"), true);
  assert.equal(isManagedAvatarUrl("/media/avatars/550e8400-e29b-41d4-a716-446655440000.heic"), false);
  assert.equal(isManagedAvatarUrl("/media/avatars/550e8400-e29b-41d4-a716-446655440000.svg"), false);
});
