import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    // 后台信息密度更高，桌面端放宽到 960px（设计文档第 9 节）
    <div className="text-small lg:relative lg:left-1/2 lg:w-[960px] lg:-translate-x-1/2">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/admin" className="text-h2 font-bold">
          小灶 · 管理后台
        </Link>
        <Link href="/me" className="text-text-muted">
          返回
        </Link>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
