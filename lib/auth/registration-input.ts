import { z } from "zod";

/**
 * 只做校验，不产出文案：调用方按失败字段映射到字典 key。
 * 之前这里带着中文 message，而调用方又统一返回「邮箱无效」，
 * 于是两次密码不一致的用户会看到一句和密码无关的报错。
 */
export const registrationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8).max(1_024),
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
  });
