import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { imageStats, searchDishes } from "@/server/admin-stats";
import { getDb } from "@/server/db";
import { cuisineMeta } from "../../t/cuisine-meta";
import { mergeDishesAction, regenerateImageAction } from "../actions";

export const metadata: Metadata = { title: "图片库" };

type Props = { searchParams: Promise<{ q?: string; msg?: string }> };

const STATUS_LABELS: Record<string, string> = {
  ready: "有图",
  none: "没图",
  queued: "排队中",
  generating: "生成中",
  failed: "失败",
};

const rate = (r: { rate: number | null; withImage: number; total: number }) =>
  r.rate === null ? "—" : `${Math.round(r.rate * 100)}%（${r.withImage}/${r.total}）`;

// 图片库（技术方案第 13 节）：总数、命中率、失败列表、重新生成、合并重复菜
export default async function ImagesPage({ searchParams }: Props) {
  const { q = "", msg } = await searchParams;
  const db = await getDb();
  const [s, found] = await Promise.all([imageStats(db), searchDishes(db, q)]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-text-muted">菜品总数</p>
          <p className="text-h1 font-bold tabular">{s.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-text-muted">有图</p>
          <p className="text-h1 font-bold tabular">{s.byStatus.ready ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-text-muted">命中率 · 7 天</p>
          <p className="text-h2 font-bold tabular">{rate(s.hit7)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-text-muted">命中率 · 30 天</p>
          <p className="text-h2 font-bold tabular">{rate(s.hit30)}</p>
        </Card>
      </div>
      <p className="mt-2 text-caption text-text-muted">
        命中率 = 推荐出的菜里推荐时已经有图的比例（PRD 第 9 节，上线 3 个月后目标 ≥ 60%）。按状态：
        {Object.entries(s.byStatus)
          .map(([k, n]) => `${STATUS_LABELS[k] ?? k} ${n}`)
          .join("，") || "暂无"}
      </p>

      <h2 className="mb-2 mt-6 font-bold">生成失败（{s.byStatus.failed ?? 0}）</h2>
      {s.failed.length === 0 ? (
        <p className="text-text-muted">没有失败的图。</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-surface-muted text-text-muted">
              <tr>
                <th className="px-3 py-2">菜</th>
                <th className="px-3 py-2">菜系</th>
                <th className="px-3 py-2">原因</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.failed.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2">{f.nameZh}</td>
                  <td className="px-3 py-2">{cuisineMeta(f.cuisineId)?.zh ?? f.cuisineId}</td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-text-muted" title={f.error ?? ""}>
                    {f.error ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={regenerateImageAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="text-primary underline">重新生成</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 mt-6 font-bold">合并重复的菜</h2>
      <Card className="p-4">
        <p className="text-text-muted">
          同一道菜被叫成了不同名字时（如“番茄炒蛋”和“西红柿炒鸡蛋”），合并后以后推荐到另一个名字也会用同一张图。只能合并同一菜系的菜；两条里有图的那条会被保留。
        </p>
        <form className="mt-3 flex gap-2" role="search">
          <input
            name="q"
            defaultValue={q}
            placeholder="搜菜名，例如：炒蛋"
            aria-label="搜菜名"
            className="h-10 flex-1 rounded-control border border-border bg-surface px-3"
          />
          <button className="h-10 rounded-control bg-primary px-4 font-bold text-primary-contrast">搜索</button>
        </form>
        {msg && (
          <p role="status" className="mt-3 rounded-control bg-surface-muted p-2">
            {msg}
          </p>
        )}
        {q && found.length === 0 && <p className="mt-3 text-text-muted">没有找到。</p>}
        {found.length > 0 && (
          <form action={mergeDishesAction} className="mt-3">
            <input type="hidden" name="q" value={q} />
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[560px] text-left">
                <thead className="bg-surface-muted text-text-muted">
                  <tr>
                    <th className="px-3 py-2">合并掉</th>
                    <th className="px-3 py-2">合并到</th>
                    <th className="px-3 py-2">菜</th>
                    <th className="px-3 py-2">菜系</th>
                    <th className="px-3 py-2">图</th>
                    <th className="px-3 py-2 text-right">被推荐</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {found.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2">
                        <input type="radio" name="from" value={d.id} required aria-label={`合并掉${d.nameZh}`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="radio" name="into" value={d.id} required aria-label={`合并到${d.nameZh}`} />
                      </td>
                      <td className="px-3 py-2">
                        {d.nameZh} <span className="text-text-muted">{d.nameEn}</span>
                      </td>
                      <td className="px-3 py-2">{cuisineMeta(d.cuisineId)?.zh ?? d.cuisineId}</td>
                      <td className="px-3 py-2">{STATUS_LABELS[d.imageStatus] ?? d.imageStatus}</td>
                      <td className="px-3 py-2 text-right tabular">{d.timesRecommended}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mt-3 h-10 rounded-control border border-border bg-surface px-4 font-bold">合并选中的两道菜</button>
          </form>
        )}
      </Card>
    </>
  );
}
