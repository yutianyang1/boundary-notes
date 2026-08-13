import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["reader", "author", "editor", "admin"]);
export const postStatus = pgEnum("post_status", ["draft", "in_review", "scheduled", "published", "archived"]);
export const commentStatus = pgEnum("comment_status", ["pending", "approved", "spam"]);
export const settingValueType = pgEnum("setting_value_type", ["string", "number", "boolean", "json"]);
export const jobStatus = pgEnum("job_status", ["running", "succeeded", "failed", "skipped"]);
export const userActionTokenType = pgEnum("user_action_token_type", ["verify_email", "reset_password", "change_email"]);
export const mailOutboxStatus = pgEnum("mail_outbox_status", ["pending", "sending", "sent", "failed"]);
export const subscriberStatus = pgEnum("subscriber_status", ["pending", "confirmed", "unsubscribed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: text("password_hash"),
  image: text("image"),
  role: userRole("role").notNull().default("reader"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaRequiredAfter: timestamp("mfa_required_after", { withTimezone: true }),
  sessionVersion: integer("session_version").notNull().default(0),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const accounts = pgTable("accounts", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: varchar("token_type", { length: 64 }),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
}, (table) => [
  primaryKey({ columns: [table.provider, table.providerAccountId] }),
  index("accounts_user_id_idx").on(table.userId),
]);

export const verificationTokens = pgTable("verification_tokens", {
  identifier: varchar("identifier", { length: 320 }).notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.identifier, table.token] })]);

export const pendingRegistrations = pgTable("pending_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenDigest: varchar("token_digest", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("pending_registrations_email_unique").on(table.email),
  uniqueIndex("pending_registrations_token_unique").on(table.tokenDigest),
  index("pending_registrations_expires_at_idx").on(table.expiresAt),
]);

export const userActionTokens = pgTable("user_action_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: userActionTokenType("type").notNull(),
  tokenDigest: varchar("token_digest", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_action_tokens_digest_unique").on(table.tokenDigest),
  index("user_action_tokens_user_type_idx").on(table.userId, table.type, table.createdAt),
]);

export const userSessions = pgTable("user_sessions", {
  jti: uuid("jti").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenWriteAt: timestamp("last_seen_write_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  deviceName: varchar("device_name", { length: 160 }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("user_sessions_user_id_idx").on(table.userId),
  index("user_sessions_expires_at_idx").on(table.expiresAt),
]);

export const mfaCredentials = pgTable("mfa_credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(),
  keyVersion: integer("key_version").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mfaRecoveryCodes = pgTable("mfa_recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("mfa_recovery_codes_user_id_idx").on(table.userId)]);

export const mailOutbox = pgTable("mail_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  template: varchar("template", { length: 80 }).notNull(),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  payloadEnc: text("payload_enc"),
  encryptionKeyVersion: integer("encryption_key_version").notNull(),
  status: mailOutboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
  lastError: text("last_error"),
}, (table) => [index("mail_outbox_pending_idx").on(table.status, table.nextAttemptAt)]);

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  status: subscriberStatus("status").notNull().default("pending"),
  confirmTokenDigest: varchar("confirm_token_digest", { length: 64 }),
  confirmTokenExpiresAt: timestamp("confirm_token_expires_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("subscribers_email_unique").on(table.email),
  uniqueIndex("subscribers_confirm_token_unique").on(table.confirmTokenDigest),
  index("subscribers_status_idx").on(table.status),
]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 180 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("categories_slug_active_unique").on(table.slug).where(sql`${table.deletedAt} is null`),
]);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 180 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("tags_slug_active_unique").on(table.slug).where(sql`${table.deletedAt} is null`),
]);

export const series = pgTable("series", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 180 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  cover: text("cover"),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("series_slug_active_unique").on(table.slug).where(sql`${table.deletedAt} is null`),
]);

export const mediaAssets = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: varchar("filename", { length: 64 }).notNull(),
  url: text("url").notNull(),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteSize: integer("byte_size").notNull(),
  title: varchar("title", { length: 240 }),
  alt: varchar("alt", { length: 500 }),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("media_filename_unique").on(table.filename),
  index("media_uploader_created_idx").on(table.uploadedBy, table.createdAt),
  index("media_created_at_idx").on(table.createdAt),
]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 240 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  summary: text("summary").notNull().default(""),
  contentMd: text("content_md").notNull().default(""),
  contentHtml: text("content_html").notNull().default(""),
  rendererVersion: integer("renderer_version").notNull().default(1),
  cover: text("cover"),
  status: postStatus("status").notNull().default("draft"),
  pinned: boolean("pinned").notNull().default(false),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
  seriesOrder: integer("series_order"),
  revision: integer("revision").notNull().default(1),
  seoTitle: varchar("seo_title", { length: 240 }),
  seoDescription: text("seo_description"),
  canonicalUrl: text("canonical_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("posts_slug_active_unique").on(table.slug).where(sql`${table.deletedAt} is null`),
  index("posts_status_published_at_idx").on(table.status, table.publishedAt),
  index("posts_author_id_idx").on(table.authorId),
  index("posts_series_order_idx").on(table.seriesId, table.seriesOrder),
  index("posts_title_trgm_idx").using("gin", table.title.op("gin_trgm_ops")),
  index("posts_summary_trgm_idx").using("gin", table.summary.op("gin_trgm_ops")),
  index("posts_content_md_trgm_idx").using("gin", table.contentMd.op("gin_trgm_ops")),
]);

export const postBroadcasts = pgTable("post_broadcasts", {
  postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  broadcastAt: timestamp("broadcast_at", { withTimezone: true }).notNull().defaultNow(),
  recipientCount: integer("recipient_count").notNull().default(0),
});

export const postViewCounts = pgTable("post_view_counts", {
  postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  viewCount: bigint("view_count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("post_view_counts_ranking_idx").on(table.viewCount),
]);

export const postViewDaily = pgTable("post_view_daily", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  viewCount: bigint("view_count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.day] }),
  index("post_view_daily_day_count_idx").on(table.day, table.viewCount),
]);

export const postRedirects = pgTable("post_redirects", {
  id: uuid("id").primaryKey().defaultRandom(),
  oldSlug: varchar("old_slug", { length: 240 }).notNull(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("post_redirects_old_slug_unique").on(table.oldSlug)]);

export const postTags = pgTable("post_tags", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.postId, table.tagId] })]);

export const postRevisions = pgTable("post_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  summary: text("summary").notNull(),
  contentMd: text("content_md").notNull(),
  status: postStatus("status").notNull(),
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
  seriesOrder: integer("series_order"),
  isPublishedVersion: boolean("is_published_version").notNull().default(false),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("post_revisions_post_revision_unique").on(table.postId, table.revision),
  index("post_revisions_post_created_idx").on(table.postId, table.createdAt),
]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  depth: integer("depth").notNull().default(0),
  content: text("content").notNull(),
  status: commentStatus("status").notNull().default("approved"),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("comments_post_status_created_idx").on(table.postId, table.status, table.createdAt),
  index("comments_user_id_idx").on(table.userId),
  check("comments_depth_check", sql`${table.depth} between 0 and 1`),
]);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 160 }).primaryKey(),
  settingGroup: varchar("group", { length: 80 }).notNull(),
  value: jsonb("value").notNull(),
  valueType: settingValueType("value_type").notNull(),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("target_type", { length: 80 }).notNull(),
  targetId: varchar("target_id", { length: 160 }),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_target_idx").on(table.targetType, table.targetId, table.createdAt)]);

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: varchar("job_name", { length: 120 }).notNull(),
  status: jobStatus("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  affectedCount: integer("affected_count").notNull().default(0),
  details: jsonb("details"),
  error: text("error"),
}, (table) => [index("job_runs_name_started_idx").on(table.jobName, table.startedAt)]);
