import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { input } from "@config/limits";
import { jsonError, readJson } from "@/server/http";
import { guardModelRoute } from "@/server/model-guard";
import { askFollowup } from "@/server/tutorial/followup";

export const maxDuration = 60;

// 前端已缩到长边 1024 像素的 JPEG（同拍照识别）
const MAX_DATA_URL = 1_600_000;

const body = z.object({
  question: z.string().trim().min(1).max(input.maxFreeTextLength),
  /** 烹饪模式里当前在第几步 */
  step: z.number().int().min(0).max(40).nullable().optional(),
  /** 锅里的照片，只转发给模型，不保存 */
  image: z
    .string()
    .max(MAX_DATA_URL)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardModelRoute(req);
  if ("error" in guard) return guard.error;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) {
    const photoBad = parsed.error.issues.some((i) => i.path[0] === "image");
    return jsonError(400, photoBad ? "照片格式不对，换一张试试" : `问题请写在 ${input.maxFreeTextLength} 字以内`, {
      code: "invalid",
    });
  }
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "找不到这份教程");

  const { question, step, image } = parsed.data;
  const result = await askFollowup(guard.db, guard.user.id, id, question, { step, image });
  if (!result.ok) return jsonError(result.status, result.error, { code: result.code });
  return NextResponse.json(result);
}
