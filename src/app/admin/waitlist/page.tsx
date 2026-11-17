import type { Metadata } from "next";
import { listWaitlist } from "@/server/admin";
import { getDb } from "@/server/db";
import { ignoreApplicantAction, inviteApplicantAction } from "../actions";

export const metadata: Metadata = { title: "邀请码申请" };

const STATUS = { pending: "待处理", invited: "已发码", ignored: "已忽略" } as const;

export default async function WaitlistPage() {
  const rows = await listWaitlist(await getDb());
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <p className="mb-3 text-text-muted">
        待处理 {pending} 条。点“发邀请码”会生成一个单次、14 天有效的邀请码并发邮件给申请人。
      </p>
      {rows.length === 0 ? (
        <p className="text-text-muted">还没有申请。</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-surface-muted text-text-muted">
              <tr>
                <th className="px-3 py-2">邮箱</th>
                <th className="px-3 py-2">留言</th>
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="max-w-[280px] px-3 py-2">{r.message ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.createdAt.toLocaleDateString("zh-CN", { timeZone: "UTC" })}
                  </td>
                  <td className="px-3 py-2">{STATUS[r.status]}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {r.status === "pending" && (
                      <div className="flex justify-end gap-3">
                        <form action={inviteApplicantAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="font-bold text-primary">发邀请码</button>
                        </form>
                        <form action={ignoreApplicantAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-text-muted">忽略</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
