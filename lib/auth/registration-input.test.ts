import assert from "node:assert/strict";
import test from "node:test";
import { registrationInputSchema } from "./registration-input";

const validInput = {
  name: "测试读者",
  email: "reader@example.com",
  password: "a-secure-password-long",
  confirmPassword: "a-secure-password-long",
};

test("registration requires matching password confirmation", () => {
  const result = registrationInputSchema.safeParse({
    ...validInput,
    confirmPassword: "a-different-password",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    // path 才是调用方用来选文案的依据，message 已从 schema 移除。
    assert.deepEqual(result.error.issues[0]?.path, ["confirmPassword"]);
  }
});

test("每种校验失败都落在自己的字段上", () => {
  // 调用方按 path[0] 映射字典 key，落错字段就会报出无关的错误。
  const cases: Array<[Partial<typeof validInput>, string]> = [
    [{ name: "" }, "name"],
    [{ name: "x".repeat(121) }, "name"],
    [{ email: "not-an-email" }, "email"],
    [{ password: "short", confirmPassword: "short" }, "password"],
    [{ confirmPassword: "mismatch" }, "confirmPassword"],
  ];
  for (const [patch, field] of cases) {
    const result = registrationInputSchema.safeParse({ ...validInput, ...patch });
    assert.equal(result.success, false, `${field} 应当校验失败`);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], field, `期望落在 ${field}`);
    }
  }
});

test("registration accepts matching long passwords", () => {
  const result = registrationInputSchema.safeParse(validInput);
  assert.equal(result.success, true);
});

test("registration accepts eight characters and rejects seven", () => {
  assert.equal(registrationInputSchema.safeParse({
    ...validInput,
    password: "abcdefgh",
    confirmPassword: "abcdefgh",
  }).success, true);
  assert.equal(registrationInputSchema.safeParse({
    ...validInput,
    password: "abcdefg",
    confirmPassword: "abcdefg",
  }).success, false);
});
