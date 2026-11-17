// 指标事件（PRD 第 9 节；技术方案第 14 节）。写入 events 表，后台“指标”页按周汇总。
// 只记录计算指标需要的最少信息，不含食材、照片、自由文本。记录失败不影响业务。
import { and, eq, gte } from "drizzle-orm";
import type { Db } from "./db/client";
import { events } from "./db/schema";

export const EVENT_NAMES = [
  "visit", // 每个账号每天第一次打开（次周回访）
  "recommend_run", // { runId, dishes, withImage, cached }（图片库命中率）
  "tutorial_open", // { tutorialId, runId }（推荐 → 打开教程）
  "cook_start", // { tutorialId }
  "cook_complete", // { tutorialId }
  "rating", // { verdict }（好评率；关闭评价记录时不记）
  "recognize", // { items }
  "recognize_edit", // { recognized, removed }（识别修改率，前端上报）
  "signup_pending", // 验证邮箱后进入填邀请码
  "signup_complete", // 邀请码兑换成功
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export async function logEvent(
  db: Db,
  userId: string | null,
  name: EventName,
  props: Record<string, unknown> | null = null,
  now = new Date(),
) {
  try {
    await db.insert(events).values({ userId, name, props, createdAt: now });
  } catch (e) {
    console.error("event log failed", name, e);
  }
}

/** 当天（UTC）第一次来时记一次 visit */
export async function touchVisit(db: Db, userId: string, now = new Date()) {
  try {
    const dayStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const [seen] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.name, "visit"), gte(events.createdAt, dayStart)))
      .limit(1);
    if (!seen) await logEvent(db, userId, "visit", null, now);
  } catch {}
}
