// 数据库表结构，对应 docs/TECH_DESIGN.md 第 4 节。
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const usd = (name: string) => numeric(name, { precision: 12, scale: 6, mode: "number" }).notNull().default(0);

// ─── 4.1 账号与登录 ───────────────────────────────────────────

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);

export const inviteCodes = pgTable("invite_codes", {
  id: id(),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(), // 一律小写
  googleSub: text("google_sub").unique(),
  displayName: text("display_name"),
  role: userRole("role").notNull().default("user"),
  status: userStatus("status").notNull().default("active"),
  inviteCodeId: uuid("invite_code_id").references(() => inviteCodes.id),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const emailOtps = pgTable(
  "email_otps",
  {
    id: id(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("email_otps_email_idx").on(t.email, t.createdAt)],
);

export const verifiedVia = pgEnum("verified_via", ["google", "email"]);

export const pendingSignups = pgTable("pending_signups", {
  id: id(),
  email: text("email").notNull(),
  googleSub: text("google_sub"),
  displayName: text("display_name"),
  verifiedVia: verifiedVia("verified_via").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    inviteCodeId: uuid("invite_code_id")
      .notNull()
      .references(() => inviteCodes.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.inviteCodeId, t.userId] })],
);

export const waitlistStatus = pgEnum("waitlist_status", ["pending", "invited", "ignored"]);

export const waitlist = pgTable("waitlist", {
  id: id(),
  email: text("email").notNull(),
  message: text("message"),
  status: waitlistStatus("status").notNull().default("pending"),
  inviteCodeId: uuid("invite_code_id").references(() => inviteCodes.id),
  createdAt: createdAt(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.key, t.windowStart] })],
);

// ─── 4.2 个性化 ───────────────────────────────────────────────

export const unitSystem = pgEnum("unit_system", ["metric", "us"]);

export const preferences = pgTable("preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  allergens: text("allergens").array().notNull().default(sql`'{}'`),
  avoid: text("avoid").array().notNull().default(sql`'{}'`),
  equipment: text("equipment").array().notNull().default(sql`'{}'`),
  pantry: text("pantry").array().notNull().default(sql`'{}'`),
  tasteNotes: text("taste_notes"),
  units: unitSystem("units").notNull().default("metric"),
  lastFlavors: text("last_flavors").array().notNull().default(sql`'{}'`),
  lastScene: text("last_scene"),
  lastCuisine: text("last_cuisine"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const privacySettings = pgTable("privacy_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  recordTaste: boolean("record_taste").notNull().default(true),
  recordHistory: boolean("record_history").notNull().default(true),
  recordRatings: boolean("record_ratings").notNull().default(true),
  recordEquipment: boolean("record_equipment").notNull().default(true),
  recordPantry: boolean("record_pantry").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── 4.3 推荐、教程与图片库 ──────────────────────────────────

export const imageStatus = pgEnum("image_status", ["none", "queued", "generating", "ready", "failed"]);

export const dishes = pgTable(
  "dishes",
  {
    id: id(),
    cuisineId: text("cuisine_id").notNull(),
    nameZh: text("name_zh").notNull(),
    nameZhNorm: text("name_zh_norm").notNull(),
    nameEn: text("name_en").notNull(),
    nameOriginal: text("name_original"),
    visual: text("visual"), // 成品外观描述，供生成图片
    imageStatus: imageStatus("image_status").notNull().default("none"),
    imageKey: text("image_key"),
    imageAttempts: smallint("image_attempts").notNull().default(0),
    timesRecommended: integer("times_recommended").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("dishes_cuisine_name_uq").on(t.cuisineId, t.nameZhNorm)],
);

export const dishAliases = pgTable(
  "dish_aliases",
  {
    aliasNorm: text("alias_norm").notNull(),
    cuisineId: text("cuisine_id").notNull(),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cuisineId, t.aliasNorm] })],
);

export const recommendationRuns = pgTable(
  "recommendation_runs",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    input: jsonb("input").notNull(),
    cacheKey: text("cache_key").notNull(),
    dishIds: uuid("dish_ids").array().notNull().default(sql`'{}'`),
    createdAt: createdAt(),
  },
  (t) => [index("recommendation_runs_user_idx").on(t.userId, t.createdAt)],
);

export const recommendationCache = pgTable("recommendation_cache", {
  cacheKey: text("cache_key").primaryKey(),
  result: jsonb("result").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const tutorialStatus = pgEnum("tutorial_status", ["streaming", "done", "failed"]);

export const tutorials = pgTable(
  "tutorials",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id),
    runId: uuid("run_id").references(() => recommendationRuns.id, { onDelete: "set null" }),
    params: jsonb("params").notNull(),
    content: jsonb("content"),
    model: text("model").notNull(),
    status: tutorialStatus("status").notNull().default("streaming"),
    createdAt: createdAt(),
  },
  (t) => [index("tutorials_user_idx").on(t.userId, t.createdAt)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tutorialId: uuid("tutorial_id")
      .notNull()
      .references(() => tutorials.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tutorialId] })],
);

export const ratingVerdict = pgEnum("rating_verdict", ["good", "ok", "never"]);

export const ratings = pgTable(
  "ratings",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tutorialId: uuid("tutorial_id")
      .notNull()
      .references(() => tutorials.id, { onDelete: "cascade" }),
    verdict: ratingVerdict("verdict").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ratings_user_tutorial_uq").on(t.userId, t.tutorialId)],
);

export const followups = pgTable(
  "followups",
  {
    id: id(),
    tutorialId: uuid("tutorial_id")
      .notNull()
      .references(() => tutorials.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    createdAt: createdAt(),
  },
  (t) => [index("followups_tutorial_idx").on(t.tutorialId)],
);

export const jobType = pgEnum("job_type", ["image", "alert"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: jobType("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_pending_idx").on(t.status, t.runAfter)],
);

// ─── 4.4 用量与成本 ───────────────────────────────────────────

export const usageDaily = pgTable(
  "usage_daily",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(), // UTC 日期
    recommend: smallint("recommend").notNull().default(0),
    tutorial: smallint("tutorial").notNull().default(0),
    recognize: smallint("recognize").notNull().default(0),
    spendUsd: usd("spend_usd"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const modelFeature = pgEnum("model_feature", [
  "recognize",
  "recommend",
  "tutorial",
  "followup",
  "image",
]);

export const modelCalls = pgTable(
  "model_calls",
  {
    id: id(),
    // 注销账号时置空，保留成本统计（技术方案 12）
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: modelFeature("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    imageCount: smallint("image_count").notNull().default(0),
    costUsd: usd("cost_usd"),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull(), // ok | error | timeout | rejected
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("model_calls_created_idx").on(t.createdAt), index("model_calls_user_idx").on(t.userId)],
);

export const dailySpend = pgTable("daily_spend", {
  day: date("day").primaryKey(),
  reservedUsd: usd("reserved_usd"),
  actualUsd: usd("actual_usd"),
  alertsSent: text("alerts_sent").array().notNull().default(sql`'{}'`),
});

export const events = pgTable(
  "events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props"),
    createdAt: createdAt(),
  },
  (t) => [index("events_name_created_idx").on(t.name, t.createdAt)],
);
