import { z } from "zod";

export const siteSettingsSchema = z.object({
  siteName: z.string().min(1).max(80),
  siteDescription: z.string().max(240),
  siteUrl: z.url(),
  siteTimezone: z.string().default("Asia/Shanghai"),
  postsPerPage: z.int().min(1).max(100).default(20),
  commentsEnabled: z.boolean().default(true),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
