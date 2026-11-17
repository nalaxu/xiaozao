// 管理后台的数据：花费（F38）、账号（F39）、图片库、指标（PRD 第 9 节）。
import { and, asc, count, desc, eq, gte, ilike, inArray, sql, sum } from "drizzle-orm";
import { budget, budgetTier, quota } from "@config/limits";
import type { Db } from "./db/client";
import { dailySpend, dishAliases, dishes, events, jobs, modelCalls, recommendationRuns, sessions, tutorials, usageDaily, users } from "./db/schema";
import { enqueueImage } from "./images/queue";

const DAY = 86400_000;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const dayStart = (d: Date) => new Date(`${dayOf(d)}T00:00:00Z`);

// ─── 花费 ──────────────────────────────────────────────────

export async function spendOverview(db: Db, now = new Date()) {
  const today = dayOf(now);
  const [row] = await db.select().from(dailySpend).where(eq(dailySpend.day, today));
  const actual = row?.actualUsd ?? 0;
  const reserved = row?.reservedUsd ?? 0;
  const byFeature = await db
    .select({
      feature: modelCalls.feature,
      calls: count(),
      cost: sum(modelCalls.costUsd).mapWith(Number),
      errors: sql<number>`count(*) filter (where ${modelCalls.status} <> 'ok')`.mapWith(Number),
      latency: sql<number>`coalesce(avg(${modelCalls.latencyMs}), 0)`.mapWith(Number),
      images: sum(modelCalls.imageCount).mapWith(Number),
    })
    .from(modelCalls)
    .where(gte(modelCalls.createdAt, dayStart(now)))
    .groupBy(modelCalls.feature)
    .orderBy(desc(sum(modelCalls.costUsd)));
  const since = dayOf(new Date(now.getTime() - 29 * DAY));
  const trendRows = await db
    .select({ day: dailySpend.day, actual: dailySpend.actualUsd })
    .from(dailySpend)
    .where(gte(dailySpend.day, since))
    .orderBy(asc(dailySpend.day));
  const byDay = new Map(trendRows.map((r) => [String(r.day), r.actual]));
  const trend = Array.from({ length: 30 }, (_, i) => {
    const d = dayOf(new Date(now.getTime() - (29 - i) * DAY));
    return { day: d, usd: byDay.get(d) ?? 0 };
  });
  const topAccounts = await db
    .select({ userId: usageDaily.userId, email: users.email, spend: usageDaily.spendUsd, recommend: usageDaily.recommend, tutorial: usageDaily.tutorial, recognize: usageDaily.recognize })
    .from(usageDaily)
    .innerJoin(users, eq(users.id, usageDaily.userId))
    .where(eq(usageDaily.day, today))
    .orderBy(desc(usageDaily.spendUsd))
    .limit(10);
  return {
    day: today,
    actual,
    reserved,
    spent: actual + reserved,
    tier: budgetTier(actual + reserved),
    thresholds: { notify: budget.notifyUsd, images: budget.stopImagesUsd, downgrade: budget.downgradeTutorialUsd, cap: budget.hardCapUsd },
    alertsSent: row?.alertsSent ?? [],
    byFeature,
    trend,
    topAccounts,
    accountAlertUsd: budget.perAccountAlertUsd,
  };
}

// ─── 账号 ──────────────────────────────────────────────────

export async function listAccounts(db: Db, q: string, now = new Date()) {
  const term = q.trim().toLowerCase().slice(0, 100);
  const base = db
    .select({ id: users.id, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users);
  const rows = await (term ? base.where(ilike(users.email, `%${term.replace(/[%_\\]/g, "\\$&")}%`)) : base)
    .orderBy(desc(users.createdAt))
    .limit(100);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const today = await db
    .select()
    .from(usageDaily)
    .where(and(inArray(usageDaily.userId, ids), eq(usageDaily.day, dayOf(now))));
  const month = await db
    .select({ userId: usageDaily.userId, spend: sum(usageDaily.spendUsd).mapWith(Number) })
    .from(usageDaily)
    .where(and(inArray(usageDaily.userId, ids), gte(usageDaily.day, dayOf(new Date(now.getTime() - 29 * DAY)))))
    .groupBy(usageDaily.userId);
  const tuts = await db
    .select({ userId: tutorials.userId, n: count() })
    .from(tutorials)
    .where(inArray(tutorials.userId, ids))
    .groupBy(tutorials.userId);
  const lastVisit = await db
    .select({ userId: events.userId, at: sql<Date>`max(${events.createdAt})` })
    .from(events)
    .where(and(inArray(events.userId, ids), eq(events.name, "visit")))
    .groupBy(events.userId);
  return rows.map((r) => {
    const t = today.find((x) => x.userId === r.id);
    return {
      ...r,
      today: { recommend: t?.recommend ?? 0, tutorial: t?.tutorial ?? 0, recognize: t?.recognize ?? 0, spend: t?.spendUsd ?? 0 },
      spend30: month.find((x) => x.userId === r.id)?.spend ?? 0,
      tutorials: tuts.find((x) => x.userId === r.id)?.n ?? 0,
      lastVisit: lastVisit.find((x) => x.userId === r.id)?.at ?? null,
    };
  });
}

/** 停用或启用账号。停用时立即让该账号的所有会话失效；不能停用自己 */
export async function setAccountStatus(db: Db, actorId: string, userId: string, status: "active" | "disabled") {
  if (actorId === userId) return false;
  const [u] = await db.update(users).set({ status }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!u) return false;
  if (status === "disabled") await db.delete(sessions).where(eq(sessions.userId, userId));
  return true;
}

// ─── 图片库 ────────────────────────────────────────────────

export async function imageStats(db: Db, now = new Date()) {
  const byStatus = await db
    .select({ status: dishes.imageStatus, n: count() })
    .from(dishes)
    .groupBy(dishes.imageStatus);
  const hit = async (days: number) => {
    const rows = await db
      .select({ props: events.props })
      .from(events)
      .where(and(eq(events.name, "recommend_run"), gte(events.createdAt, new Date(now.getTime() - days * DAY))));
    let total = 0;
    let withImage = 0;
    for (const r of rows) {
      const p = r.props as { dishes?: number; withImage?: number } | null;
      total += p?.dishes ?? 0;
      withImage += p?.withImage ?? 0;
    }
    return { total, withImage, rate: total ? withImage / total : null };
  };
  const failed = await db
    .select({ id: dishes.id, nameZh: dishes.nameZh, cuisineId: dishes.cuisineId, attempts: dishes.imageAttempts, createdAt: dishes.createdAt })
    .from(dishes)
    .where(eq(dishes.imageStatus, "failed"))
    .orderBy(desc(dishes.createdAt))
    .limit(50);
  const errors = failed.length
    ? await db
        .select({ payload: jobs.payload, lastError: jobs.lastError })
        .from(jobs)
        .where(and(eq(jobs.type, "image"), eq(jobs.status, "failed")))
        .orderBy(desc(jobs.createdAt))
        .limit(200)
    : [];
  const errorFor = (id: string) => errors.find((e) => (e.payload as { dishId?: string }).dishId === id)?.lastError ?? null;
  const total = byStatus.reduce((n, r) => n + r.n, 0);
  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number>,
    hit7: await hit(7),
    hit30: await hit(30),
    failed: failed.map((f) => ({ ...f, error: errorFor(f.id) })),
  };
}

/** 失败的图重新排队（清零重试次数） */
export async function regenerateImage(db: Db, dishId: string, now = new Date()) {
  const [d] = await db
    .update(dishes)
    .set({ imageStatus: "none", imageAttempts: 0 })
    .where(and(eq(dishes.id, dishId), eq(dishes.imageStatus, "failed")))
    .returning({ id: dishes.id });
  return d ? enqueueImage(db, dishId, now) : false;
}

export async function searchDishes(db: Db, q: string) {
  const term = q.trim().slice(0, 50);
  if (!term) return [];
  return db
    .select({ id: dishes.id, nameZh: dishes.nameZh, nameEn: dishes.nameEn, cuisineId: dishes.cuisineId, imageStatus: dishes.imageStatus, timesRecommended: dishes.timesRecommended })
    .from(dishes)
    .where(ilike(dishes.nameZh, `%${term.replace(/[%_\\]/g, "\\$&")}%`))
    .orderBy(desc(dishes.timesRecommended))
    .limit(30);
}

/**
 * 合并同菜异名（技术方案 8.1）：两道菜必须同一菜系。保留有图的那条（都有或都没有时保留 into），
 * 另一条的名字写进 dish_aliases，教程改指向保留的那条，然后删掉它。
 */
export async function mergeDishes(db: Db, fromId: string, intoId: string) {
  if (fromId === intoId) return { ok: false as const, reason: "同一道菜" };
  const rows = await db.select().from(dishes).where(inArray(dishes.id, [fromId, intoId]));
  const from = rows.find((r) => r.id === fromId);
  const into = rows.find((r) => r.id === intoId);
  if (!from || !into) return { ok: false as const, reason: "找不到菜" };
  if (from.cuisineId !== into.cuisineId) return { ok: false as const, reason: "只能合并同一菜系的菜" };
  const [keep, drop] = from.imageStatus === "ready" && into.imageStatus !== "ready" ? [from, into] : [into, from];
  await db
    .insert(dishAliases)
    .values({ aliasNorm: drop.nameZhNorm, cuisineId: drop.cuisineId, dishId: keep.id })
    .onConflictDoUpdate({ target: [dishAliases.cuisineId, dishAliases.aliasNorm], set: { dishId: keep.id } });
  // 原先指向被删那条的别名也改指向保留的那条
  await db.update(dishAliases).set({ dishId: keep.id }).where(eq(dishAliases.dishId, drop.id));
  await db.update(tutorials).set({ dishId: keep.id }).where(eq(tutorials.dishId, drop.id));
  await db
    .update(recommendationRuns)
    .set({ dishIds: sql`array_replace(${recommendationRuns.dishIds}, ${drop.id}::uuid, ${keep.id}::uuid)` })
    .where(sql`${drop.id}::uuid = ANY(${recommendationRuns.dishIds})`);
  await db
    .update(dishes)
    .set({ timesRecommended: keep.timesRecommended + drop.timesRecommended })
    .where(eq(dishes.id, keep.id));
  await db.delete(jobs).where(and(eq(jobs.type, "image"), sql`${jobs.payload}->>'dishId' = ${drop.id}`));
  await db.delete(dishes).where(eq(dishes.id, drop.id));
  return { ok: true as const, kept: keep.nameZh, dropped: drop.nameZh };
}

// ─── 指标（按周） ──────────────────────────────────────────

/** UTC 周一 0 点 */
export function weekStart(d: Date) {
  const s = dayStart(d);
  const dow = (s.getUTCDay() + 6) % 7;
  return new Date(s.getTime() - dow * DAY);
}

type Ratio = { n: number; d: number };
export interface WeekMetrics {
  week: string;
  recommendToTutorial: Ratio;
  tutorialToCook: Ratio;
  cookCompletion: Ratio;
  goodRate: Ratio;
  nextWeekReturn: Ratio | null;
  recognizeEdit: Ratio;
  imageHit: Ratio;
  inviteToSignup: Ratio;
  quotaExhausted: Ratio;
}

export async function weeklyMetrics(db: Db, weeks = 8, now = new Date()): Promise<{ weeks: WeekMetrics[]; monthly: { cost: number; activeUsers: number } }> {
  const thisWeek = weekStart(now);
  const from = new Date(thisWeek.getTime() - (weeks - 1) * 7 * DAY);
  const rows = await db
    .select({ userId: events.userId, name: events.name, props: events.props, createdAt: events.createdAt })
    .from(events)
    .where(gte(events.createdAt, from));
  const usage = await db
    .select({ userId: usageDaily.userId, day: usageDaily.day, recommend: usageDaily.recommend })
    .from(usageDaily)
    .where(gte(usageDaily.day, dayOf(from)));

  const weekKey = (d: Date) => dayOf(weekStart(d));
  const keys = Array.from({ length: weeks }, (_, i) => dayOf(new Date(from.getTime() + i * 7 * DAY)));
  const inWeek = (k: string) => rows.filter((r) => weekKey(r.createdAt) === k);
  const prop = (r: { props: unknown }, key: string) => (r.props as Record<string, unknown> | null)?.[key];
  const distinct = (list: typeof rows, key: string) => new Set(list.map((r) => String(prop(r, key)))).size;
  const visitors = (k: string) => new Set(inWeek(k).filter((r) => r.name === "visit").map((r) => r.userId));

  const result = keys.map((k, i): WeekMetrics => {
    const w = inWeek(k);
    const by = (name: string) => w.filter((r) => r.name === name);
    const runs = by("recommend_run");
    const opens = by("tutorial_open");
    const runIds = new Set(runs.map((r) => String(prop(r, "runId"))));
    const openedRuns = new Set(opens.map((r) => String(prop(r, "runId"))).filter((id) => runIds.has(id)));
    const cookStarts = by("cook_start");
    const ratingsW = by("rating");
    const edits = by("recognize_edit");
    const sumProp = (list: typeof rows, key: string) => list.reduce((n, r) => n + Number(prop(r, key) ?? 0), 0);
    const next = keys[i + 1];
    const v = visitors(k);
    const weekUsage = usage.filter((u) => weekKey(new Date(`${u.day}T00:00:00Z`)) === k);
    const users = new Set(weekUsage.map((u) => u.userId));
    const exhausted = new Set(weekUsage.filter((u) => u.recommend >= quota.recommendPerDay).map((u) => u.userId));
    return {
      week: k,
      recommendToTutorial: { n: openedRuns.size, d: runIds.size },
      tutorialToCook: { n: distinct(cookStarts, "tutorialId"), d: distinct(opens, "tutorialId") },
      cookCompletion: { n: distinct(by("cook_complete"), "tutorialId"), d: distinct(cookStarts, "tutorialId") },
      goodRate: { n: ratingsW.filter((r) => prop(r, "verdict") === "good").length, d: ratingsW.length },
      nextWeekReturn: next ? { n: [...v].filter((u) => visitors(next).has(u)).length, d: v.size } : null,
      recognizeEdit: { n: sumProp(edits, "removed"), d: sumProp(edits, "recognized") },
      imageHit: { n: sumProp(runs, "withImage"), d: sumProp(runs, "dishes") },
      inviteToSignup: { n: distinct(by("signup_complete"), "pendingId"), d: distinct(by("signup_pending"), "pendingId") },
      quotaExhausted: { n: exhausted.size, d: users.size },
    };
  });

  // 月活人均成本：近 30 天全站花费 / 近 30 天有访问的账号数
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const [cost] = await db
    .select({ usd: sql<number>`coalesce(sum(${modelCalls.costUsd}), 0)`.mapWith(Number) })
    .from(modelCalls)
    .where(gte(modelCalls.createdAt, monthAgo));
  const [active] = await db
    .select({ n: sql<number>`count(distinct ${events.userId})`.mapWith(Number) })
    .from(events)
    .where(and(eq(events.name, "visit"), gte(events.createdAt, monthAgo)));
  return { weeks: result.reverse(), monthly: { cost: cost?.usd ?? 0, activeUsers: active?.n ?? 0 } };
}
