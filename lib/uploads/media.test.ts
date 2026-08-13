import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MAX_MEDIA_BYTES, validateMediaImage } from "./media";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("accepts valid PNG, AVIF, GIF and sanitized SVG media", async () => {
  const png = await validateMediaImage(onePixelPng);
  assert.equal(png.ok, true);
  if (png.ok) assert.deepEqual(
    { extension: png.image.extension, width: png.image.width, height: png.image.height },
    { extension: "png", width: 1, height: 1 },
  );

  const avifBytes = await sharp({ create: { width: 2, height: 3, channels: 4, background: "red" } })
    .avif()
    .toBuffer();
  const avif = await validateMediaImage(avifBytes);
  assert.equal(avif.ok, true);
  if (avif.ok) assert.equal(avif.image.extension, "avif");

  const gifBytes = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "base64",
  );
  const gif = await validateMediaImage(gifBytes);
  assert.equal(gif.ok, true);
  if (gif.ok) assert.equal(gif.image.extension, "gif");

  const svg = await validateMediaImage(Buffer.from(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 10' onload='alert(1)'/>",
  ));
  assert.equal(svg.ok, true);
  if (svg.ok) {
    assert.equal(svg.image.extension, "svg");
    assert.doesNotMatch(Buffer.from(svg.image.bytes).toString("utf8"), /onload/);
  }
});

test("rejects damaged, oversized and over-dimension images", async () => {
  const damaged = await validateMediaImage(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  assert.equal(damaged.ok, false);

  const oversized = await validateMediaImage(new Uint8Array(MAX_MEDIA_BYTES + 1));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.match(oversized.error, /8 MB/);

  const hugePng = Buffer.from(onePixelPng);
  hugePng.writeUInt32BE(6001, 16);
  const overDimension = await validateMediaImage(hugePng);
  assert.equal(overDimension.ok, false);
  if (!overDimension.ok) assert.match(overDimension.error, /6000px/);
});
