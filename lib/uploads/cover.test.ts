import assert from "node:assert/strict";
import test from "node:test";
import { inspectCover, isManagedCoverUrl } from "./cover";

test("accepts a valid small PNG cover and rejects GIF", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const accepted = await inspectCover(png);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.deepEqual(
      {
        extension: accepted.image.extension,
        contentType: accepted.image.contentType,
        width: accepted.image.width,
        height: accepted.image.height,
      },
      { extension: "png", contentType: "image/png", width: 1, height: 1 },
    );
  }
  const gif = await inspectCover(Buffer.from("GIF89a", "ascii"));
  assert.equal(gif.ok, false);
  if (!gif.ok) assert.match(gif.error, /封面不支持 GIF/);
});

test("only recognizes immutable managed cover URLs", () => {
  assert.equal(isManagedCoverUrl("/media/covers/550e8400-e29b-41d4-a716-446655440000.webp"), true);
  assert.equal(isManagedCoverUrl("/media/covers/550e8400-e29b-41d4-a716-446655440000.avif"), true);
  assert.equal(isManagedCoverUrl("/media/covers/550e8400-e29b-41d4-a716-446655440000.svg"), true);
  assert.equal(isManagedCoverUrl("/media/covers/550e8400-e29b-41d4-a716-446655440000.gif"), false);
  assert.equal(isManagedCoverUrl("/media/covers/550e8400-e29b-41d4-a716-446655440000.heic"), false);
});
