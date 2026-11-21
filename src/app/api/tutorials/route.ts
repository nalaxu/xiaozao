import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import type { RecommendInput } from "@/lib/recommend-types";
import type { TutorialEvent } from "@/lib/tutorial-types";
import { jsonError, readJson } from "@/server/http";
import { processImageJobs } from "@/server/images/jobs";
import { enqueueImage } from "@/server/images/queue";
import { guardModelRoute } from "@/server/model-guard";
import { existingTutorial, findRunDish, runTutorial } from "@/server/tutorial/run";

export const maxDuration = 150;

const body = z.object({ runId: z.string().uuid(), dishId: z.string().uuid() });

/**
 * 生成教程，以 NDJSON 流式返回 TutorialEvent。
 * 同一次推荐里同一道菜已经生成过时，直接返回 { existing: id }，不再扣额度。
 */
export async function POST(req: NextRequest) {
  const guard = await guardModelRoute(req);
  if ("error" in guard) return guard.error;
  const { user, db } = guard;

  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "参数不对", { code: "invalid" });
  const { runId, dishId } = parsed.data;

  const found = await findRunDish(db, user.id, runId, dishId);
  if (!found) return jsonError(404, "找不到这道菜，请回到推荐页重新选", { code: "invalid" });
  const existing = await existingTutorial(db, user.id, runId, dishId);
  if (existing) return NextResponse.json({ existing });

  // 推荐时没排上的图，这里补一次
  if (await enqueueImage(db, dishId)) after(() => processImageJobs(db, { dishIds: [dishId] }));

  const runInput = found.run.input as Partial<RecommendInput>;
  const scene = runInput.scene ?? null;
  // 首页第二步选的人数；旧的推荐记录没有，按习惯和场景默认
  const servings = runInput.servings ?? null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: TutorialEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runTutorial(db, user, { runId, dish: found.dish, scene, servings }, emit);
      } catch (e) {
        console.error("tutorial route failed", e);
        emit({ type: "error", code: "model", error: "这次没生成出来，请稍后再试", refunded: false });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
