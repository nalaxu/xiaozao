import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/admin-nav";
import { listAccounts } from "@/server/admin-stats";
import { requireAdmin } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { setAccountStatusAction } from "../actions";

export const metadata: Metadata = { title: "账号" };

type Props = { searchParams: Promise<{ q?: string }> };

const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("zh-CN", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) + " UTC" : "—";

// 账号（PRD F39）：搜索、查看用量与花费、停用 / 启用
export default async function AccountsPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  const q = (await searchParams).q ?? "";
  const rows = await listAccounts(await getDb(), q);

  return (
    <>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="按邮箱搜索"
          aria-label="按邮箱搜索"
          className="h-10 flex-1 rounded-control border border-border bg-surface px-3"
        />
        <button className="h-10 rounded-control bg-primary px-4 font-bold text-primary-contrast">搜索</button>
      </form>
      <p className="mb-2 mt-4 text-text-muted">{q ? `找到 ${rows.length} 个` : `最近注册的 ${rows.length} 个`}（最多显示 100 个）</p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[860px] text-left tabular">
          <thead className="bg-surface-muted text-text-muted">
            <tr>
              <th className="px-3 py-2">邮箱</th>
              <th className="px-3 py-2">注册</th>
              <th className="px-3 py-2">最近访问</th>
              <th className="px-3 py-2 text-right">今日 推荐/教程/拍照</th>
              <th className="px-3 py-2 text-right">今日花费</th>
              <th className="px-3 py-2 text-right">30 天花费</th>
              <th className="px-3 py-2 text-right">教程数</th>
              <th className="px-3 py-2">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-text-muted">
                  没有找到账号。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={r.status === "disabled" ? "text-text-muted" : ""}>
                <td className="px-3 py-2">
                  {r.email}
                  {r.role === "admin" && <span className="ml-1 rounded bg-primary-soft px-1 text-caption text-primary">管理员</span>}
                </td>
                <td className="px-3 py-2">{fmt(r.createdAt)}</td>
                <td className="px-3 py-2">{fmt(r.lastVisit)}</td>
                <td className="px-3 py-2 text-right">
                  {r.today.recommend} / {r.today.tutorial} / {r.today.recognize}
                </td>
                <td className="px-3 py-2 text-right">${r.today.spend.toFixed(4)}</td>
                <td className="px-3 py-2 text-right">${r.spend30.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{r.tutorials}</td>
                <td className="px-3 py-2">
                  {r.id === admin.id ? (
                    <span className="text-text-muted">你自己</span>
                  ) : (
                    <form action={setAccountStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={r.status === "active" ? "disabled" : "active"} />
                      <span className={r.status === "active" ? "text-success" : "text-danger"}>
                        {r.status === "active" ? "正常" : "已停用"}
                      </span>
                      {r.status === "active" ? (
                        <ConfirmButton message={`停用 ${r.email}？该账号会立即退出登录，不能再使用。`} className="text-danger underline">
                          停用
                        </ConfirmButton>
                      ) : (
                        <button className="text-primary underline">启用</button>
                      )}
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
