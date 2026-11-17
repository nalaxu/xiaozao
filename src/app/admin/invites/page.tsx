import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { listInviteCodes } from "@/server/admin";
import { getDb } from "@/server/db";
import { createInvitesAction, revokeInviteAction } from "../actions";

export const metadata: Metadata = { title: "邀请码" };

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("zh-CN", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) + " UTC" : "—";

function statusOf(c: { revokedAt: Date | null; expiresAt: Date | null; usedCount: number; maxUses: number }) {
  if (c.revokedAt) return { label: "已作废", cls: "text-danger" };
  if (c.expiresAt && c.expiresAt < new Date()) return { label: "已过期", cls: "text-text-muted" };
  if (c.usedCount >= c.maxUses) return { label: "已用完", cls: "text-text-muted" };
  return { label: "可用", cls: "text-success" };
}

export default async function InvitesPage() {
  const codes = await listInviteCodes(await getDb());

  return (
    <>
      <Card className="p-4">
        <h2 className="mb-3 font-bold">生成邀请码</h2>
        <form action={createInvitesAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
          <label className="flex flex-col gap-1">
            数量
            <input name="count" type="number" min={1} max={50} defaultValue={1} className="h-10 rounded-control border border-border bg-surface px-3" />
          </label>
          <label className="flex flex-col gap-1">
            每个可用次数
            <input name="maxUses" type="number" min={1} max={1000} defaultValue={1} className="h-10 rounded-control border border-border bg-surface px-3" />
          </label>
          <label className="flex flex-col gap-1">
            有效天数（0 为不限）
            <input name="expiresInDays" type="number" min={0} max={365} defaultValue={30} className="h-10 rounded-control border border-border bg-surface px-3" />
          </label>
          <label className="flex flex-col gap-1">
            备注
            <input name="note" maxLength={100} placeholder="比如：朋友圈第一批" className="h-10 rounded-control border border-border bg-surface px-3" />
          </label>
          <button className="col-span-2 h-10 rounded-control bg-primary font-bold text-primary-contrast sm:col-span-1">
            生成
          </button>
        </form>
      </Card>

      <h2 className="mb-2 mt-6 font-bold">全部邀请码（最近 200 个）</h2>
      {codes.length === 0 ? (
        <p className="text-text-muted">还没有邀请码。</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-surface-muted text-text-muted">
              <tr>
                <th className="px-3 py-2">邀请码</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">已用</th>
                <th className="px-3 py-2">到期</th>
                <th className="px-3 py-2">备注</th>
                <th className="px-3 py-2">使用者</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {codes.map((c) => {
                const s = statusOf(c);
                return (
                  <tr key={c.id}>
                    <td className="tabular px-3 py-2 font-bold tracking-wider">{c.code}</td>
                    <td className={`px-3 py-2 ${s.cls}`}>{s.label}</td>
                    <td className="tabular px-3 py-2">
                      {c.usedCount}/{c.maxUses}
                    </td>
                    <td className="px-3 py-2">{fmt(c.expiresAt)}</td>
                    <td className="px-3 py-2">{c.note ?? "—"}</td>
                    <td className="px-3 py-2">{c.usedBy.join("、") || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {s.label === "可用" && (
                        <form action={revokeInviteAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="text-danger">作废</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
