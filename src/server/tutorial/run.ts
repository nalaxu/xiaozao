// 生成一份教程（技术方案 7.4）：预占额度 → 选模型（预算降级）→ 流式生成 → 过敏原检查（命中重来一次）→ 保存。
import { and, desc, eq, inArray } from "drizzle-orm";
import { budget } from "@config/limits";
import { modelFor, tutorialFallbackModel } from "@config/models";
import type { RecommendedDish } from "@/lib/recommend-types";
import type { TutorialContent, TutorialEvent } from "@/lib/tutorial-types";
import type { Db } from "../db/client";
import { recommendationRuns, tutorials } from "../db/schema";
import { logEvent } from "../events";
import { cookingProfile, loadPersonalization, preferenceSummary, ratedDishes, restrictionKeywords } from "../preferences";
import { nextReset, refundQuota, reserveQuota, spentToday } from "../usage";
import { BudgetPausedError, callModel } from "../ai/call";
import { ModelError } from "../ai/types";
import {
  defaultServings,
  restrictedInTutorial,
  tutorialContentSchema,
  tutorialRequest,
  type TutorialParams,
} from "./model";

interface RunUser {
  id: string;
  role: "user" | "admin";
}

type Emit = (e: TutorialEvent) => void;

/** 推荐结果里的这道菜；不属于该用户或不在这次推荐里返回 null */
export async function findRunDish(db: Db, userId: string, runId: string, dishId: string) {
  const [run] = await db
    .select()
    .from(recommendationRuns)
    .where(and(eq(recommendationRuns.id, runId), eq(recommendationRuns.userId, userId)));
  if (!run) return null;
  const dish = (run.dishes as RecommendedDish[]).find((d) => d.dishId === dishId);
  return dish ? { run, dish } : null;
}

/** 同一次推荐里同一道菜已经生成过（或正在生成）的教程，避免重复扣额度 */
export async function existingTutorial(db: Db, userId: string, runId: string, dishId: string) {
  const [row] = await db
    .select({ id: tutorials.id })
    .from(tutorials)
    .where(
      and(
        eq(tutorials.userId, userId),
        eq(tutorials.runId, runId),
        eq(tutorials.dishId, dishId),
        inArray(tutorials.status, ["done", "streaming"]),
      ),
    )
    .orderBy(desc(tutorials.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function runTutorial(
  db: Db,
  user: RunUser,
  target: { runId: string; dish: RecommendedDish; scene: string | null },
  emit: Emit,
  now = new Date(),
) {
  const quota = await reserveQuota(db, user, "tutorial", now);
  if (!quota.ok) {
    emit({
      type: "error",
      code: "quota",
      error: "今天的教程次数用完了",
      refunded: false,
      resetAt: nextReset(now).toISOString(),
    });
    return;
  }

  const { prefs, privacy } = await loadPersonalization(db, user.id);
  const keywords = restrictionKeywords(prefs);
  const profile = cookingProfile(prefs, privacy);
  const params: TutorialParams = {
    servings: defaultServings(target.scene, profile.household),
    units: prefs?.units ?? "metric",
    equipment: privacy.recordEquipment ? (prefs?.equipment ?? []) : [],
    pantry: privacy.recordPantry ? (prefs?.pantry ?? []) : [],
    summary: preferenceSummary(prefs, privacy, await ratedDishes(db, user.id, privacy)),
    scene: target.scene,
    profile,
  };
  // 当日花费达到降级档位后改用较便宜的模型（技术方案 9.2）
  const model =
    (await spentToday(db, now)) >= budget.downgradeTutorialUsd ? tutorialFallbackModel() : modelFor("tutorial");

  const [row] = await db
    .insert(tutorials)
    .values({ userId: user.id, dishId: target.dish.dishId, runId: target.runId, params, model, status: "streaming" })
    .returning({ id: tutorials.id });
  emit({ type: "start", id: row.id, remaining: user.role === "admin" ? null : quota.remaining, model });
  await logEvent(db, user.id, "tutorial_open", { tutorialId: row.id, runId: target.runId });

  const fail = async (code: string, error: string) => {
    await db.update(tutorials).set({ status: "failed" }).where(eq(tutorials.id, row.id));
    await refundQuota(db, user.id, "tutorial", now);
    emit({ type: "error", code, error, refunded: true, resetAt: nextReset(now).toISOString() });
  };

  let retryNote: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let content: TutorialContent;
    try {
      const result = await callModel(db, user.id, tutorialRequest({ dish: target.dish, params, model, retryNote }), (text) =>
        emit({ type: "delta", text }),
      );
      content = tutorialContentSchema.parse(JSON.parse(result.text));
    } catch (e) {
      if (e instanceof BudgetPausedError) return fail("budget_paused", "今天的生成名额已满");
      if (!(e instanceof ModelError)) console.error("tutorial failed", e);
      return fail("model", "这次没生成出来，次数已退回。再试一次？");
    }

    const hit = restrictedInTutorial(content, keywords);
    if (hit) {
      if (attempt === 0) {
        retryNote = `注意：上一版用到了“${hit}”，它在用户的忌口与过敏里，这次绝对不能用。`;
        emit({ type: "reset", reason: "考虑到你的忌口，正在换一种做法…" });
        continue;
      }
      return fail("restricted", "没能避开你的忌口写出这道菜，次数已退回。换一道试试？");
    }

    // 菜名、菜系以推荐时为准，便于对到图片库
    content.overview.cuisine_id = target.dish.cuisineId;
    await db.update(tutorials).set({ content, status: "done" }).where(eq(tutorials.id, row.id));
    emit({ type: "done", content });
    return;
  }
}
