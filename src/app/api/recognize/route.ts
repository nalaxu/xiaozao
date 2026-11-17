import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { input } from "@config/limits";
import { BudgetPausedError, callModel } from "@/server/ai/call";
import { logEvent } from "@/server/events";
import { normalizeRecognized, recognizeRequest, type RawRecognized } from "@/server/ai/recognize";
import { jsonError, readJson } from "@/server/http";
import { guardModelRoute } from "@/server/model-guard";
import { nextReset, refundQuota, reserveQuota } from "@/server/usage";

export const maxDuration = 20;

// 前端已缩到长边 1024 像素的 JPEG，单张约 100–400 KB；上限留足余量
const MAX_DATA_URL = 1_600_000;

const body = z.object({
  images: z
    .array(z.string().max(MAX_DATA_URL).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/))
    .min(1)
    .max(input.maxPhotos),
});

const rawSchema = z.object({
  not_food: z.boolean(),
  items: z
    .array(
      z.object({
        name_zh: z.string(),
        name_en: z.string(),
        confidence: z.enum(["high", "low"]),
        quantity_hint: z.string().nullable(),
      }),
    )
    .max(30),
});

export async function POST(req: NextRequest) {
  const guard = await guardModelRoute(req);
  if ("error" in guard) return guard.error;
  const { user, db } = guard;

  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "照片格式不对，换一张试试", { code: "invalid" });

  const now = new Date();
  const quota = await reserveQuota(db, user, "recognize", now);
  if (!quota.ok) {
    return jsonError(429, "今天的拍照识别次数用完了，手动输入也很快", {
      code: "quota",
      resetAt: nextReset(now).toISOString(),
    });
  }

  try {
    const result = await callModel(db, user.id, recognizeRequest(parsed.data.images));
    const raw = rawSchema.parse(JSON.parse(result.text)) as RawRecognized;
    const { notFood, items } = normalizeRecognized(raw);
    await logEvent(db, user.id, "recognize", { items: items.length, notFood });
    return NextResponse.json({
      notFood,
      items,
      remaining: user.role === "admin" ? null : quota.remaining,
    });
  } catch (e) {
    await refundQuota(db, user.id, "recognize", now);
    if (e instanceof BudgetPausedError) {
      return jsonError(503, "今天的生成名额已满，手动输入也很快", { code: "budget_paused", refunded: true });
    }
    return jsonError(502, "没认出来，手动输入也很快", { code: "model", refunded: true });
  }
}
