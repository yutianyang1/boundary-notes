import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "新密码至少需要 8 个字符。")
  .max(1_024, "密码过长。");
