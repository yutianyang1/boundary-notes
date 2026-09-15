import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionKey,
  connectionLabel,
  forgetConnection,
  MAX_SAVED_CONNECTIONS,
  normalizeSavedConnections,
  rememberConnection,
  type SavedConnection,
} from "./saved-connections";

const base: SavedConnection = {
  host: "127.0.0.1",
  port: 22,
  username: "yty",
  authMethod: "password",
  fingerprint: "SHA256:abcDEF123+/x",
  lastUsedAt: 100,
};

test("invalid stored entries are dropped and secrets never survive", () => {
  const result = normalizeSavedConnections([
    base,
    { ...base, host: "bad host; rm -rf /" },
    { ...base, port: 70_000 },
    { ...base, username: "" },
    { ...base, host: "example.com", password: "hunter2", privateKey: "-----BEGIN", fingerprint: "not-a-fingerprint" },
    "junk",
    null,
  ]);
  assert.equal(result.length, 2);
  const example = result.find((item) => item.host === "example.com");
  assert.ok(example);
  assert.equal(example.fingerprint, "");
  assert.equal("password" in example, false);
  assert.equal("privateKey" in example, false);
  assert.deepEqual(normalizeSavedConnections({ not: "an array" }), []);
});

test("same connection is deduplicated and most recent comes first", () => {
  const result = normalizeSavedConnections([
    { ...base, lastUsedAt: 1 },
    { ...base, host: "EXAMPLE.com", lastUsedAt: 5 },
    { ...base, lastUsedAt: 9, authMethod: "key" },
  ]);
  assert.deepEqual(result.map((item) => [item.host, item.lastUsedAt, item.authMethod]), [
    ["127.0.0.1", 9, "key"],
    ["EXAMPLE.com", 5, "password"],
  ]);
});

test("remember moves a connection to the top and caps the list", () => {
  let list: SavedConnection[] = [];
  for (let index = 0; index < MAX_SAVED_CONNECTIONS + 3; index++) {
    list = rememberConnection(list, { ...base, host: `h${index}.example.com`, lastUsedAt: index });
  }
  assert.equal(list.length, MAX_SAVED_CONNECTIONS);
  list = rememberConnection(list, { ...list.at(-1)!, lastUsedAt: 1_000 });
  assert.equal(list[0].lastUsedAt, 1_000);
  assert.equal(list.length, MAX_SAVED_CONNECTIONS);
});

test("forget removes by key and labels hide the default port", () => {
  const list = [base, { ...base, port: 2222, lastUsedAt: 50 }];
  assert.equal(connectionLabel(base), "yty@127.0.0.1");
  assert.equal(connectionLabel(list[1]), "yty@127.0.0.1:2222");
  assert.deepEqual(forgetConnection(list, connectionKey(base)), [list[1]]);
});
