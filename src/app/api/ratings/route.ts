import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/server/api-user";
import { jsonError, readJson } from "@/server/http";
import { rateTutorial, ratingInput, removeRating } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  const parsed = ratingInput.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请求格式不正确");
  const r = await rateTutorial(g.db, g.user.id, parsed.data);
  if (!r.ok) return jsonError(404, "找不到这份教程");
  return NextResponse.json({ recorded: r.recorded });
}

export async function DELETE(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  const id = req.nextUrl.searchParams.get("tutorialId") ?? "";
  await removeRating(g.db, g.user.id, id);
  return NextResponse.json({ ok: true });
}
