import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/server/api-user";
import { logEvent } from "@/server/events";
import { jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

// 前端上报的指标事件。只接受白名单里的事件和固定字段
const body = z.object({
  name: z.literal("recognize_edit"),
  props: z.object({ recognized: z.number().int().min(0).max(100), removed: z.number().int().min(0).max(100) }).strict(),
});

export async function POST(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请求格式不正确");
  await logEvent(g.db, g.user.id, parsed.data.name, parsed.data.props);
  return NextResponse.json({ ok: true });
}
