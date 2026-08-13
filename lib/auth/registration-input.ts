import { z } from "zod";

export const registrationInputSchema = z
  .object({
    name: z.string().trim().min(1, "请输入昵称").max(120),
    email: z.email("请输入有效邮箱").transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8, "密码至少需要 8 个字符").max(1_024),
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });
