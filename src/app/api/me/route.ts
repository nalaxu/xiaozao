import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/server/api-user";
import { getCurrentUser, signOut } from "@/server/auth/current";
import { jsonError, readJson } from "@/server/http";
import { deleteAccount } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
  });
}

// 注销账号：需要输入“注销”二次确认（设计文档 4.10）
export async function DELETE(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  const parsed = z.object({ confirm: z.literal("注销") }).safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请输入“注销”确认");
  await signOut();
  await deleteAccount(g.db, g.user.id);
  return NextResponse.json({ ok: true });
}
