import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/server/api-user";
import { jsonError, readJson } from "@/server/http";
import { privacyPatch, setPrivacy } from "@/server/settings";

export const dynamic = "force-dynamic";

// 每类记录的开关；关闭时 purge 为 true 则同时删除已记录的数据（设计文档 4.10）
export async function PUT(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  const parsed = privacyPatch.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请求格式不正确");
  await setPrivacy(g.db, g.user.id, parsed.data.key, parsed.data.on, parsed.data.purge);
  return NextResponse.json({ ok: true });
}
