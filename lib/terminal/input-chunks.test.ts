import assert from "node:assert/strict";
import test from "node:test";
import { MAX_INPUT_CHARS, splitTerminalInput } from "./input-chunks";

const SERVER_LIMIT_BYTES = 16_384;

test("short input is sent as one piece and empty input as none", () => {
  assert.deepEqual(splitTerminalInput("ls -al\r"), ["ls -al\r"]);
  assert.deepEqual(splitTerminalInput(""), []);
});

test("large paste is split under the server byte limit and loses nothing", () => {
  const pasted = "中文abc".repeat(5_000);
  const chunks = splitTerminalInput(pasted);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), pasted);
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(chunk, "utf8") <= SERVER_LIMIT_BYTES);
  }
});

test("surrogate pairs are never split across chunks", () => {
  const emoji = "😀";
  const chunks = splitTerminalInput("a".repeat(MAX_INPUT_CHARS - 1) + emoji.repeat(4));
  assert.equal(chunks.join(""), "a".repeat(MAX_INPUT_CHARS - 1) + emoji.repeat(4));
  for (const chunk of chunks) {
    assert.equal(/[\uD800-\uDBFF]$/.test(chunk), false, "chunk ends on a lone high surrogate");
    assert.equal(/^[\uDC00-\uDFFF]/.test(chunk), false, "chunk starts on a lone low surrogate");
  }
});
