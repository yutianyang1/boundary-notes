import assert from "node:assert/strict";
import { mkdir, mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GET } from "../../app/media/library/[filename]/route";

test("library media route serves allowlisted files with hardened headers", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "blog-media-route-"));
  const library = path.join(temporaryRoot, "library");
  const filename = "550e8400-e29b-41d4-a716-446655440000.png";
  const target = path.join(library, filename);
  await mkdir(library);
  await writeFile(target, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const previousUploadsDir = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = temporaryRoot;

  try {
    const response = await GET(
      new Request(`https://blog.test/media/library/${filename}`),
      { params: Promise.resolve({ filename }) },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("cache-control") ?? "", /immutable/);
  } finally {
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousUploadsDir;
    await unlink(target);
    await rmdir(library);
    await rmdir(temporaryRoot);
  }
});

test("library media route rejects traversal and non-image filenames", async () => {
  await assert.rejects(() => GET(
    new Request("https://blog.test/media/library/secret"),
    { params: Promise.resolve({ filename: "../../secret.png" }) },
  ));
});

test("library route serves SVG with sandboxed CSP", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "blog-media-svg-route-"));
  const library = path.join(temporaryRoot, "library");
  const filename = "550e8400-e29b-41d4-a716-446655440000.svg";
  const target = path.join(library, filename);
  await mkdir(library);
  await writeFile(target, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>"));
  const previousUploadsDir = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = temporaryRoot;

  try {
    const response = await GET(
      new Request(`https://blog.test/media/library/${filename}`),
      { params: Promise.resolve({ filename }) },
    );
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /sandbox/);
  } finally {
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousUploadsDir;
    await unlink(target);
    await rmdir(library);
    await rmdir(temporaryRoot);
  }
});
