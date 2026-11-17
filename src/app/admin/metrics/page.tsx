import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { weeklyMetrics, type WeekMetrics } from "@/server/admin-stats";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "指标" };

type Ratio = { n: number; d: number } | null;

// PRD 第 9 节的指标与初始目标；better 表示越高越好还是越低越好
const ROWS: { key: keyof Omit<WeekMetrics, "week">; label: string; target: number | null; better: "high" | "low" }[] = [
  { key: "recommendToTutorial", label: "推荐 → 打开教程", target: 0.5, better: "high" },
  { key: "tutorialToCook", label: "教程 → 进入烹饪模式", target: 0.3, better: "high" },
  { key: "cookCompletion", label: "烹饪模式完成率", target: 0.6, better: "high" },
  { key: "goodRate", label: "好评率", target: 0.7, better: "high" },
  { key: "nextWeekReturn", label: "次周回访", target: 0.25, better: "high" },
  { key: "recognizeEdit", label: "拍照识别修改率", target: 0.3, better: "low" },
  { key: "imageHit", label: "图片库命中率", target: 0.6, better: "high" },
  { key: "inviteToSignup", label: "邀请码 → 注册完成", target: 0.7, better: "high" },
  { key: "quotaExhausted", label: "用完当日推荐额度的账号", target: 0.3, better: "low" },
];

function Cell({ r, target, better }: { r: Ratio; target: number | null; better: "high" | "low" }) {
  if (!r) return <span className="text-text-muted">下周可算</span>;
  if (!r.d) return <span className="text-text-muted">—</span>;
  const v = r.n / r.d;
  const ok = target === null ? null : better === "high" ? v >= target : v <= target;
  return (
    <span title={`${r.n} / ${r.d}`} className={ok === null ? "" : ok ? "text-success" : "text-danger"}>
      {Math.round(v * 100)}%<span className="ml-1 text-caption text-text-muted">{r.d}</span>
    </span>
  );
}

// 指标（PRD 第 9 节；技术方案第 14 节）：按 UTC 周汇总 events 表
export default async function MetricsPage() {
  const { weeks, monthly } = await weeklyMetrics(await getDb());
  const perUser = monthly.activeUsers ? monthly.cost / monthly.activeUsers : null;
  return (
    <>
      <Card className="p-4">
        <p className="text-text-muted">月活用户人均成本（近 30 天）</p>
        <p className="text-h1 font-bold tabular">
          {perUser === null ? "—" : `$${perUser.toFixed(2)}`}
          <span className="ml-2 text-small font-normal text-text-muted">
            花费 ${monthly.cost.toFixed(2)} / {monthly.activeUsers} 个活跃账号；目标初期 ≤ $1.7，成熟后 ≤ $1.0
          </span>
        </p>
      </Card>
      <p className="mb-2 mt-6 text-text-muted">
        每格是比例，小字是分母（样本数）。绿色达到 PRD 的初始目标，红色未达到；样本少时不必在意。周从周一（UTC）开始。
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[880px] text-left tabular">
          <thead className="bg-surface-muted text-text-muted">
            <tr>
              <th className="px-3 py-2">指标</th>
              <th className="px-3 py-2">目标</th>
              {weeks.map((w) => (
                <th key={w.week} className="px-3 py-2 text-right">
                  {w.week.slice(5)} 起
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-text-muted">
                  {row.target === null ? "观察" : `${row.better === "high" ? "≥" : "≤"} ${row.target * 100}%`}
                </td>
                {weeks.map((w) => (
                  <td key={w.week} className="px-3 py-2 text-right">
                    <Cell r={w[row.key] as Ratio} target={row.target} better={row.better} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-text-muted">
        “用完当日推荐额度的账号”是观察项：超过 30% 时重新评估额度。“次周回访”= 本周来过的账号中下周也来过的比例。
      </p>
    </>
  );
}
