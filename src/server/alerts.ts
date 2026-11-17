// 花费告警（PRD 6.3；技术方案 9.2）：
// - 全站当日花费达到 $50 / $80 / $95 / $100 各通知一次；
// - 单个账号当日花费超过 $1 通知一次。
// 每次模型调用记账后检查，命中的阈值写进 daily_spend.alerts_sent（原子去重）并排一条 alert 任务；
// 任务立即尝试发送，失败的由每分钟巡检重试。
import { and, eq, lte, sql } from "drizzle-orm";
import { budget } from "@config/limits";
import type { Db } from "./db/client";
import { dailySpend, jobs, usageDaily, users } from "./db/schema";
import { sendMail, type Mail, type MailSender } from "./mail";

export type AlertPayload =
  | { kind: "budget"; threshold: number; spent: number; day: string }
  | { kind: "account"; userId: string; spent: number; day: string };

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

export function budgetThresholds() {
  return [budget.notifyUsd, budget.stopImagesUsd, budget.downgradeTutorialUsd, budget.hardCapUsd];
}

/** 把 key 记进当天的 alerts_sent；已记过返回 false（保证每个阈值每天只发一次） */
async function claim(db: Db, day: string, key: string) {
  await db.insert(dailySpend).values({ day }).onConflictDoNothing();
  const rows = await db
    .update(dailySpend)
    .set({ alertsSent: sql`array_append(${dailySpend.alertsSent}, ${key})` })
    .where(and(eq(dailySpend.day, day), sql`NOT (${key} = ANY(${dailySpend.alertsSent}))`))
    .returning({ day: dailySpend.day });
  return rows.length > 0;
}

/** 记账后调用。返回新排入的告警数 */
export async function checkAlerts(db: Db, { userId, now = new Date() }: { userId: string | null; now?: Date }) {
  const day = dayOf(now);
  const [row] = await db.select().from(dailySpend).where(eq(dailySpend.day, day));
  const spent = row ? row.actualUsd + row.reservedUsd : 0;
  const payloads: AlertPayload[] = [];
  for (const t of budgetThresholds()) {
    if (spent >= t && !row?.alertsSent.includes(`budget:${t}`) && (await claim(db, day, `budget:${t}`))) {
      payloads.push({ kind: "budget", threshold: t, spent, day });
    }
  }
  if (userId) {
    const [u] = await db
      .select({ spend: usageDaily.spendUsd })
      .from(usageDaily)
      .where(and(eq(usageDaily.userId, userId), eq(usageDaily.day, day)));
    const key = `account:${userId}`;
    if (u && u.spend > budget.perAccountAlertUsd && !row?.alertsSent.includes(key) && (await claim(db, day, key))) {
      payloads.push({ kind: "account", userId, spent: u.spend, day });
    }
  }
  if (payloads.length) {
    await db.insert(jobs).values(payloads.map((payload) => ({ type: "alert" as const, payload, runAfter: now })));
  }
  return payloads.length;
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const money = (n: number) => `$${n.toFixed(2)}`;

const TIER_TEXT: Record<string, string> = {
  notify: "目前只是提醒，功能不受影响。",
  images: "已暂停生成新图片，图片库里没有的菜显示占位图。",
  downgrade: "教程已改用较便宜的备用模型。",
  cap: "已暂停新的推荐、教程、拍照和追问，UTC 零点自动恢复。已保存的教程和烹饪模式照常可用。",
};

export async function alertMail(db: Db, to: string, p: AlertPayload): Promise<Mail> {
  const app = process.env.APP_URL ?? "http://localhost:3000";
  if (p.kind === "budget") {
    const tier =
      p.threshold >= budget.hardCapUsd
        ? "cap"
        : p.threshold >= budget.downgradeTutorialUsd
          ? "downgrade"
          : p.threshold >= budget.stopImagesUsd
            ? "images"
            : "notify";
    return {
      to,
      subject: `小灶今日花费已达 ${money(p.threshold)}`,
      text: `${p.day}（UTC）全站花费已到 ${money(p.spent)}，每日上限 ${money(budget.hardCapUsd)}。\n${TIER_TEXT[tier]}\n\n查看花费：${app}/admin`,
    };
  }
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, p.userId));
  const who = u?.email ?? "（账号已注销）";
  return {
    to,
    subject: `小灶：有账号当日花费超过 ${money(budget.perAccountAlertUsd)}`,
    text: `${p.day}（UTC）账号 ${who} 已花费 ${money(p.spent)}。正常用满额度约 $0.66，超出可能有异常。\n\n查看账号：${app}/admin/accounts?q=${encodeURIComponent(u?.email ?? "")}`,
  };
}

/** 发送待发的告警。没配置 ADMIN_EMAILS 时只标记完成 */
export async function processAlertJobs(db: Db, { now = new Date(), send = sendMail }: { now?: Date; send?: MailSender } = {}) {
  const pending = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, "alert"), eq(jobs.status, "pending"), lte(jobs.runAfter, now)))
    .limit(10);
  let sent = 0;
  for (const { id } of pending) {
    const [job] = await db
      .update(jobs)
      .set({ status: "running", runAfter: new Date(now.getTime() + LEASE_MS), attempts: sql`${jobs.attempts} + 1` })
      .where(and(eq(jobs.id, id), eq(jobs.status, "pending")))
      .returning();
    if (!job) continue;
    try {
      for (const to of adminEmails()) await send(await alertMail(db, to, job.payload as AlertPayload));
      await db.update(jobs).set({ status: "done", lastError: null }).where(eq(jobs.id, id));
      sent++;
    } catch (e) {
      const failed = job.attempts >= MAX_ATTEMPTS;
      await db
        .update(jobs)
        .set({
          status: failed ? "failed" : "pending",
          runAfter: new Date(now.getTime() + 5 * 60_000),
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        })
        .where(eq(jobs.id, id));
    }
  }
  return sent;
}

/** 记账后立即尝试发送，不阻塞调用方；测试里不发 */
export function kickAlertSender(db: Db) {
  if (process.env.VITEST) return;
  void processAlertJobs(db).catch((e) => console.error("alert send failed", e));
}
