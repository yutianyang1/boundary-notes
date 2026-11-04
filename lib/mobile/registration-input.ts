import { z } from "zod";
const token = z.string().min(20).max(256).regex(/^[A-Za-z0-9_-]+$/);
export const mobileRegistrationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: z.string().trim().min(1).max(320), resend: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("verify"), token }).strict(),
  z.object({ action: z.literal("complete"), token, name: z.string().max(120), password: z.string().max(1024), confirmPassword: z.string().max(1024) }).strict(),
]);
