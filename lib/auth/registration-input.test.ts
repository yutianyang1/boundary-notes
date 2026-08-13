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
    assert.equal(result.error.issues[0]?.message, "两次输入的密码不一致");
    assert.deepEqual(result.error.issues[0]?.path, ["confirmPassword"]);
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
