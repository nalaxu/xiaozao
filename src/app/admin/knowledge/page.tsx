import type { Metadata } from "next";
import { kb } from "@/lib/kb";

export const metadata: Metadata = { title: "知识库" };

// 知识库审核状态（PRD F40，只读）。改状态在 knowledge/*.yaml 里完成，重新部署后生效
export default function KnowledgePage() {
  const drafts = kb.review.filter((r) => r.status === "draft");
  return (
    <>
      <p className="mb-3 text-text-muted">
        知识库版本 {kb.version}。{drafts.length ? `${drafts.length} 个文件待终审。` : "全部已终审。"}
        未终审的菜系不会上线；过敏原文件例外，未终审也会生效（关键词只会让过滤更严）。审核方法见 knowledge/README.md。
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-surface-muted text-text-muted">
            <tr>
              <th className="px-3 py-2">文件</th>
              <th className="px-3 py-2">内容</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">终审人</th>
              <th className="px-3 py-2">终审日期</th>
              <th className="px-3 py-2 text-right">待核对</th>
              <th className="px-3 py-2">线上</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {kb.review.map((r) => (
              <tr key={r.file}>
                <td className="px-3 py-2 font-mono text-caption">{r.file}</td>
                <td className="px-3 py-2">{r.title}</td>
                <td className={`px-3 py-2 ${r.status === "reviewed" ? "text-success" : "text-warning"}`}>
                  {r.status === "reviewed" ? "已终审" : "草稿"}
                </td>
                <td className="px-3 py-2">{r.reviewedBy ?? "—"}</td>
                <td className="px-3 py-2">{r.reviewedAt ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular">{r.notes || "—"}</td>
                <td className="px-3 py-2">{r.published ? "是" : "否"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
