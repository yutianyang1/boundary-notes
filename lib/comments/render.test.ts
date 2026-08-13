import assert from "node:assert/strict";
import test from "node:test";
import { renderComment } from "./render";

test("comment markdown strips active and disallowed content and hardens links", async () => {
  const html = await renderComment(`# heading\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![image](https://evil.test/x.png)\n\n[example](https://example.com)`);
  assert.doesNotMatch(html, /<h1|<script|<img|onerror/i);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="nofollow ugc noopener"/);
  assert.match(html, /target="_blank"/);
});
