import assert from "node:assert/strict";
import test from "node:test";
import {
  isExplicitlyAllowedHost,
  isPrivateAddress,
  normalizeHostKeyFingerprint,
  normalizeTerminalUploadName,
} from "./policy";

test("private and metadata addresses are blocked", () => {
  for (const address of [
    "127.0.0.1", "10.0.0.1", "100.64.0.1", "172.16.4.2", "192.168.1.2",
    "169.254.169.254", "198.51.100.2", "224.0.0.1", "::1", "fd00::1",
    "::ffff:127.0.0.1", "2001:db8::1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("host allowlist is exact and case-insensitive", () => {
  const allowed = new Set(["db.internal", "10.0.0.5"]);
  assert.equal(isExplicitlyAllowedHost("DB.INTERNAL.", allowed), true);
  assert.equal(isExplicitlyAllowedHost("db.internal.example", allowed), false);
  assert.equal(isExplicitlyAllowedHost("10.0.0.5", allowed), true);
});

test("host key fingerprints accept OpenSSH notation", () => {
  assert.equal(normalizeHostKeyFingerprint("SHA256:abc123=="), "abc123");
});

test("terminal upload filenames are safe remote basenames", () => {
  assert.equal(normalizeTerminalUploadName(" report.txt "), "report.txt");
  assert.equal(normalizeTerminalUploadName("../../secret.txt"), ".._.._secret.txt");
  assert.equal(normalizeTerminalUploadName("folder\\file.txt"), "folder_file.txt");
  assert.equal(normalizeTerminalUploadName("."), null);
  assert.equal(normalizeTerminalUploadName("a".repeat(241)), null);
});
