import assert from "node:assert/strict";
import test from "node:test";
import { getMailSender } from "./sender";

test("unknown mail provider is rejected instead of silently falling back", () => {
  const previous = process.env.MAIL_PROVIDER;
  process.env.MAIL_PROVIDER = "mystery";
  try {
    assert.throws(() => getMailSender(), /Unknown MAIL_PROVIDER/);
  } finally {
    restore("MAIL_PROVIDER", previous);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
