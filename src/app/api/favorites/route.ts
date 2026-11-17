import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";
import { setFavorite } from "@/server/saved";

export const dynamic = "force-dynamic";

const body = z.object({ tutorialId: z.string().uuid(), on: z.boolean() });

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "请先登录", { code: "auth" });
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请求格式不正确");
  const r = await setFavorite(await getDb(), user.id, parsed.data.tutorialId, parsed.data.on);
  if (r === null) return jsonError(404, "找不到这份教程");
  return NextResponse.json({ favorite: r });
}
