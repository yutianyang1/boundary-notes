import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  contentTypeForExtension,
  detectImageType,
  managedImageFilenamePattern,
  prepareUploadedImage,
  readFtypBrands,
  sanitizeSvg,
} from "./image";

function ftyp(major: string, compatible: string[] = []) {
  const boxSize = 16 + compatible.length * 4;
  const bytes = Buffer.alloc(boxSize);
  bytes.writeUInt32BE(boxSize, 0);
  bytes.write("ftyp", 4, "ascii");
  bytes.write(major, 8, "ascii");
  for (const [index, brand] of compatible.entries()) {
    bytes.write(brand, 16 + index * 4, "ascii");
  }
  return bytes;
}

test("detects raster and text formats from content", () => {
  assert.equal(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), "jpeg");
  assert.equal(
    detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "png",
  );
  assert.equal(detectImageType(Buffer.from("RIFF0000WEBP", "ascii")), "webp");
  assert.equal(detectImageType(Buffer.from("GIF87a", "ascii")), "gif");
  assert.equal(detectImageType(Buffer.from("GIF89a", "ascii")), "gif");
  assert.equal(detectImageType(Buffer.from("\uFEFF  <svg viewBox='0 0 1 1'/>")), "svg");
});

test("distinguishes AVIF and HEIC by all ftyp brands", () => {
  assert.deepEqual(readFtypBrands(ftyp("mif1", ["avif"])), ["mif1", "avif"]);
  assert.equal(detectImageType(ftyp("avif")), "avif");
  assert.equal(detectImageType(ftyp("mif1", ["avif"])), "avif");
  assert.equal(detectImageType(ftyp("heic", ["mif1"])), "heic");
  assert.equal(detectImageType(ftyp("mif1")), "heic");
  assert.equal(detectImageType(ftyp("mp42")), null);
});

test("managed names and MIME types use the storage allowlist, never HEIC", () => {
  for (const extension of ["jpg", "png", "webp", "avif", "gif", "svg"]) {
    assert.equal(
      managedImageFilenamePattern.test(`550e8400-e29b-41d4-a716-446655440000.${extension}`),
      true,
    );
  }
  assert.equal(managedImageFilenamePattern.test("550e8400-e29b-41d4-a716-446655440000.heic"), false);
  assert.equal(managedImageFilenamePattern.test("../../secret.png"), false);
  assert.equal(contentTypeForExtension("avif"), "image/avif");
  assert.equal(contentTypeForExtension("gif"), "image/gif");
  assert.equal(contentTypeForExtension("svg"), "image/svg+xml");
  assert.equal(contentTypeForExtension("heic"), null);
});

test("sanitizes active SVG content and external references", () => {
  const unsafe = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         viewBox="0 0 100 50" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><div>HTML</div></foreignObject>
      <a xlink:href="https://evil.test"><rect width="10" height="10"/></a>
      <image href="javascript:alert(1)" width="1" height="1"/>
      <style>@import url(https://evil.test/a.css); rect { fill: red }</style>
    </svg>
  `);
  const result = sanitizeSvg(unsafe);
  const output = Buffer.from(result.bytes).toString("utf8");
  assert.equal(result.width, 100);
  assert.equal(result.height, 50);
  assert.doesNotMatch(output, /script|foreignObject|onload|evil\.test|javascript:/i);
});

test("rejects SVG without dimensions and blocks SVG for avatars", async () => {
  assert.throws(
    () => sanitizeSvg(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0'/></svg>")),
    /width\/height|viewBox/,
  );
  const result = await prepareUploadedImage(
    Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>"),
    "avatars",
    { maxEdge: 6000, maxPixels: 30_000_000 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /头像不支持 SVG/);
});

const heicFixture = Buffer.from(
  "AAAAHGZ0eXBoZWl4AAAAAG1pZjFoZWl4bWlhZgAAAeZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAADRpbG9jAAAAAERAAAIAAQAAAAACCgABAAAAAAAAABoAAgAAAAACJAABAAAAAAAAABoAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAAACAABodmMxAAAAAA5waXRtAAAAAAABAAABJWlwcnAAAAD9aXBjbwAAAHFodmNDAQQIAAAAAAAAAAAAHvAA/Pz4+AAADwNgAAEAF0ABDAH//wQIAAADAJ/4AAADAAAeugJAYQABACZCAQEECAAAAwCf+AAAAwAAHsCCBBZbqrprmwIAAAMAMgAAAwACEGIAAQAGRAHBc8CJAAAAE2NvbHJuY2x4AAEADQAGgAAAABRpc3BlAAAAAAAAAEAAAABAAAAAKGNsYXAAAAABAAAAAQAAAAEAAAAB////wQAAAAL////BAAAAAgAAAA5waXhpAAAAAAEIAAAAJ2F1eEMAAAAAdXJuOm1wZWc6aGV2YzoyMDE1OmF1eGlkOjEAAAAAIGlwbWEAAAAAAAAAAgABBYECAwWEAAIFgQMFhoQAAAAaaXJlZgAAAAAAAAAOYXV4bAACAAEAAQAAADxtZGF0AAAAFigBrifn1w3//h8LF2CTBXX9jsSqc/oAAAAWKAGuJ+fXDbP+G8cXYJMFdf2OxKpz+g==",
  "base64",
);
test("transcodes HEIC to metadata-free WebP", async () => {
  const result = await prepareUploadedImage(
    heicFixture,
    "library",
    { maxEdge: 6000, maxPixels: 30_000_000 },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.image.extension, "webp");
  assert.equal(result.image.contentType, "image/webp");
  assert.equal(result.image.width, 1);
  assert.equal(result.image.height, 1);
  assert.equal(Buffer.from(result.image.bytes.subarray(0, 4)).toString("ascii"), "RIFF");
  const metadata = await sharp(result.image.bytes).metadata();
  assert.equal(metadata.exif, undefined);
});
