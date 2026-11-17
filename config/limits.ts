// 额度、预算与限流的数值（PRD 4.6、6.3；技术方案第 5、9 节）。
// 数字都可用环境变量覆盖，便于上线后按实际数据调整。

const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== "" && process.env[key] !== undefined ? v : fallback;
};

export const quota = {
  recommendPerDay: num("QUOTA_RECOMMEND", 3),
  tutorialPerDay: num("QUOTA_TUTORIAL", 3),
  recognizePerDay: num("QUOTA_RECOGNIZE", 3),
  followupsPerTutorial: num("QUOTA_FOLLOWUP", 5),
};

export const budget = {
  notifyUsd: num("BUDGET_NOTIFY", 50),
  stopImagesUsd: num("BUDGET_STOP_IMAGES", 80),
  downgradeTutorialUsd: num("BUDGET_DOWNGRADE", 95),
  hardCapUsd: num("BUDGET_CAP", 100),
  perAccountAlertUsd: num("BUDGET_ACCOUNT_ALERT", 1),
};

/** 当日花费所处档位，从低到高 */
export type BudgetTier = "normal" | "notified" | "no-new-images" | "tutorial-downgraded" | "paused";

export function budgetTier(spentUsd: number): BudgetTier {
  if (spentUsd >= budget.hardCapUsd) return "paused";
  if (spentUsd >= budget.downgradeTutorialUsd) return "tutorial-downgraded";
  if (spentUsd >= budget.stopImagesUsd) return "no-new-images";
  if (spentUsd >= budget.notifyUsd) return "notified";
  return "normal";
}

export const otp = {
  ttlSeconds: 10 * 60,
  maxAttempts: 5,
  resendSeconds: 60,
  perEmailPerHour: 5,
  perEmailPerDay: 10,
  perIpPerHour: 10,
};

export const session = { ttlDays: 30 };

export const signup = {
  pendingTtlMinutes: 30,
  inviteAttemptsPerIpPerHour: 10,
  signupsPerIpPerDay: 3,
};

export const rate = {
  modelCallsPerUserPerMinute: 10,
  anonymousPerIpPerMinute: 60,
};

export const input = {
  maxIngredients: 30,
  maxIngredientLength: 30,
  maxMainIngredients: 5,
  maxFlavors: 3,
  maxFreeTextLength: 300,
  maxPhotos: 3,
  photoMaxEdge: 1024,
};
