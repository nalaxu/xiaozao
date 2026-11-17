import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/server/api-user";
import { deleteAllData } from "@/server/settings";

export const dynamic = "force-dynamic";

// 删除全部个性化数据，账号保留（PRD F30）
export async function DELETE(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  await deleteAllData(g.db, g.user.id);
  return NextResponse.json({ ok: true });
}
