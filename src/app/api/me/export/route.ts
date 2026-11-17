import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/server/api-user";
import { exportData } from "@/server/settings";

export const dynamic = "force-dynamic";

// 导出全部个人数据（PRD F30）
export async function GET(req: NextRequest) {
  const g = await apiUser(req, { write: false });
  if ("error" in g) return g.error;
  const data = await exportData(g.db, g.user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="xiaozao-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
