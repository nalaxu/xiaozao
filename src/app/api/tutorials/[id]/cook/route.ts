import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";
import { recordCook } from "@/server/saved";

export const dynamic = "force-dynamic";

const body = z.object({ event: z.enum(["start", "complete"]) });

// 烹饪模式的进入与完成（指标事件，技术方案第 14 节；完成会在历史里标“做过”）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "请先登录", { code: "auth" });
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请求格式不正确");
  const ok = await recordCook(await getDb(), user.id, (await params).id, parsed.data.event);
  if (!ok) return jsonError(404, "找不到这份教程");
  return NextResponse.json({ ok: true });
}
