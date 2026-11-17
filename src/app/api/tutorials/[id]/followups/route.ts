import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { input } from "@config/limits";
import { jsonError, readJson } from "@/server/http";
import { guardModelRoute } from "@/server/model-guard";
import { askFollowup } from "@/server/tutorial/followup";

export const maxDuration = 40;

const body = z.object({ question: z.string().trim().min(1).max(input.maxFreeTextLength) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardModelRoute(req);
  if ("error" in guard) return guard.error;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, `问题请写在 ${input.maxFreeTextLength} 字以内`, { code: "invalid" });
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "找不到这份教程");

  const result = await askFollowup(guard.db, guard.user.id, id, parsed.data.question);
  if (!result.ok) return jsonError(result.status, result.error, { code: result.code });
  return NextResponse.json(result);
}
