import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import { readTutorial } from "@/server/tutorial/read";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "请先登录", { code: "auth" });
  const t = await readTutorial(await getDb(), user.id, (await params).id);
  if (!t) return jsonError(404, "找不到这份教程");
  return NextResponse.json(t);
}
