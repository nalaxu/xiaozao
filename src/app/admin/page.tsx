import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { spendOverview } from "@/server/admin-stats";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "花费" };

const FEATURE_LABELS: Record<string, string> = {
  recognize: "拍照识别",
  recommend: "推荐",
  tutorial: "教程",
  followup: "追问",
  image: "图片",
};

const TIER_LABELS: Record<string, { label: string; cls: string }> = {
  normal: { label: "正常", cls: "text-success" },
  notified: { label: "已提醒（≥ 通知线）", cls: "text-warning" },
  "no-new-images": { label: "已暂停生成新图片", cls: "text-warning" },
  "tutorial-downgraded": { label: "教程已降级到备用模型", cls: "text-danger" },
  paused: { label: "已暂停所有生成，UTC 零点恢复", cls: "text-danger" },
};

const usd = (n: number, digits = 2) => `$${n.toFixed(digits)}`;

// 花费（PRD F38；设计文档第 9 节）：当日预算进度、按环节分列、近 30 天趋势
export default async function SpendPage() {
  const s = await spendOverview(await getDb());
  const cap = s.thresholds.cap;
  const pct = (n: number) => `${Math.min(100, (n / cap) * 100)}%`;
  const max = Math.max(cap * 0.1, ...s.trend.map((t) => t.usd));
  const tier = TIER_LABELS[s.tier];

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">今日花费（{s.day} UTC）</h2>
          <p className={`font-bold ${tier.cls}`}>{tier.label}</p>
        </div>
        <p className="mt-1 text-h1 font-bold tabular">
          {usd(s.spent)} <span className="text-small font-normal text-text-muted">/ 上限 {usd(cap, 0)}</span>
        </p>
        <p className="text-caption text-text-muted tabular">
          已结算 {usd(s.actual, 4)} · 进行中预占 {usd(s.reserved, 4)}
        </p>
        <div className="relative mt-6 h-4 rounded-full bg-surface-muted" role="img" aria-label={`已用 ${usd(s.spent)}，上限 ${usd(cap, 0)}`}>
          <div className="h-full rounded-full bg-primary" style={{ width: pct(s.spent) }} />
          {(
            [
              [s.thresholds.notify, "通知", "top"],
              [s.thresholds.images, "停图", "top"],
              [s.thresholds.downgrade, "降级", "bottom"],
              [cap, "暂停", "top"],
            ] as const
          ).map(([v, label, side]) => (
            // 降级和暂停离得近，标签一上一下错开；最右的标签右对齐，免得超出边框
            <div
              key={label}
              className={`absolute flex flex-col items-center ${side === "top" ? "-top-5 bottom-0" : "top-0 -bottom-5 flex-col-reverse"} ${
                v >= cap ? "-translate-x-full items-end" : "-translate-x-1/2"
              }`}
              style={{ left: pct(v) }}
            >
              <span className="whitespace-nowrap text-caption text-text-muted">
                {label} ${v}
              </span>
              <span className="w-px flex-1 bg-text-muted" />
            </div>
          ))}
        </div>
        <div className="h-4" aria-hidden />
        {s.alertsSent.length > 0 && (
          <p className="mt-3 text-caption text-text-muted">
            今天已发告警：{s.alertsSent.filter((a) => a.startsWith("budget:")).map((a) => `$${a.slice(7)}`).join("、") || "无"}
            {s.alertsSent.some((a) => a.startsWith("account:")) &&
              `；账号超 ${usd(s.accountAlertUsd, 0)} ${s.alertsSent.filter((a) => a.startsWith("account:")).length} 个`}
          </p>
        )}
      </Card>

      <h2 className="mb-2 mt-6 font-bold">按环节</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[560px] text-left tabular">
          <thead className="bg-surface-muted text-text-muted">
            <tr>
              <th className="px-3 py-2">环节</th>
              <th className="px-3 py-2 text-right">调用</th>
              <th className="px-3 py-2 text-right">失败</th>
              <th className="px-3 py-2 text-right">平均耗时</th>
              <th className="px-3 py-2 text-right">花费</th>
              <th className="px-3 py-2 text-right">每次</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {s.byFeature.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-text-muted">
                  今天还没有模型调用。
                </td>
              </tr>
            )}
            {s.byFeature.map((f) => (
              <tr key={f.feature}>
                <td className="px-3 py-2">
                  {FEATURE_LABELS[f.feature] ?? f.feature}
                  {f.feature === "image" && f.images ? <span className="text-text-muted">（{f.images} 张）</span> : null}
                </td>
                <td className="px-3 py-2 text-right">{f.calls}</td>
                <td className={`px-3 py-2 text-right ${f.errors ? "text-danger" : ""}`}>{f.errors}</td>
                <td className="px-3 py-2 text-right">{(f.latency / 1000).toFixed(1)} 秒</td>
                <td className="px-3 py-2 text-right">{usd(f.cost ?? 0, 4)}</td>
                <td className="px-3 py-2 text-right">{usd((f.cost ?? 0) / Math.max(1, f.calls), 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-6 font-bold">近 30 天</h2>
      <Card className="p-4">
        <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="近 30 天每日花费">
          {s.trend.map((t) => (
            <div key={t.day} className="group relative flex h-full flex-1 items-end" title={`${t.day}：${usd(t.usd)}`}>
              <div
                className={`w-full rounded-t ${t.usd >= s.thresholds.images ? "bg-danger" : t.usd >= s.thresholds.notify ? "bg-warning" : "bg-primary"}`}
                style={{ height: `${Math.max(t.usd > 0 ? 2 : 0, (t.usd / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-caption text-text-muted tabular">
          <span>{s.trend[0].day}</span>
          <span>
            合计 {usd(s.trend.reduce((n, t) => n + t.usd, 0))} · 最高 {usd(Math.max(...s.trend.map((t) => t.usd)))}
          </span>
          <span>{s.trend[s.trend.length - 1].day}</span>
        </div>
      </Card>

      <h2 className="mb-2 mt-6 font-bold">今日花费最多的账号</h2>
      {s.topAccounts.length === 0 ? (
        <p className="text-text-muted">今天还没有账号产生花费。</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[560px] text-left tabular">
            <thead className="bg-surface-muted text-text-muted">
              <tr>
                <th className="px-3 py-2">账号</th>
                <th className="px-3 py-2 text-right">推荐 / 教程 / 拍照</th>
                <th className="px-3 py-2 text-right">花费</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.topAccounts.map((a) => (
                <tr key={a.userId}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/accounts?q=${encodeURIComponent(a.email)}`} className="underline">
                      {a.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a.recommend} / {a.tutorial} / {a.recognize}
                  </td>
                  <td className={`px-3 py-2 text-right ${a.spend > s.accountAlertUsd ? "font-bold text-danger" : ""}`}>{usd(a.spend, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
