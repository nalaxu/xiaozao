import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { input as limits } from "@config/limits";
import { kb } from "@/lib/kb";
import type { RecommendEvent } from "@/lib/recommend-types";
import { jsonError, readJson } from "@/server/http";
import { imageConcurrency } from "@config/models";
import { processImageJobs } from "@/server/images/jobs";
import { guardModelRoute } from "@/server/model-guard";
import { runRecommend } from "@/server/recommend/run";

export const maxDuration = 60;

const name = z.string().trim().min(1).max(limits.maxIngredientLength);
const flavorIds = kb.flavors.map((f) => f.id) as [string, ...string[]];
const sceneIds = kb.scenes.map((s) => s.id) as [string, ...string[]];
const cuisineIds = kb.cuisines.map((c) => c.id) as [string, ...string[]];

const body = z
  .object({
    main: z.array(name).max(limits.maxMainIngredients),
    other: z.array(name).max(limits.maxIngredients),
    flavors: z.array(z.enum(flavorIds)).max(limits.maxFlavors),
    scene: z.enum(sceneIds).nullable(),
    cuisine: z.enum(cuisineIds).nullable(),
    exclude: z.array(z.string().max(40)).max(60).default([]),
  })
  .refine((b) => b.main.length + b.other.length <= limits.maxIngredients);

/** 以 NDJSON 流式返回 RecommendEvent，每行一个事件 */
export async function POST(req: NextRequest) {
  const guard = await guardModelRoute(req);
  if ("error" in guard) return guard.error;
  const { user, db } = guard;

  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "选择的条件不对，请返回重选", { code: "invalid" });

  // 响应结束后立即生成新菜的图片（技术方案 8.2）。after() 需在请求上下文内注册，菜单通过 promise 传进去
  let resolveQueued: (ids: string[]) => void = () => {};
  const queued = new Promise<string[]>((r) => (resolveQueued = r));
  after(async () => {
    const ids = await queued;
    // 按并发上限分轮生成，避免一次占满中转站的并发、挤掉用户接着要的教程请求
    for (let round = 0; ids.length && round < ids.length; round++) {
      const r = await processImageJobs(db, { dishIds: ids, limit: imageConcurrency() });
      if (r.done + r.failed === 0 || r.postponed) break;
    }
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: RecommendEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      let ids: string[] = [];
      try {
        ids = (await runRecommend(db, user, parsed.data, emit)).queuedImages;
      } catch (e) {
        console.error("recommend route failed", e);
        emit({ type: "error", code: "model", error: "这次没生成出来，请稍后再试", refunded: false });
      } finally {
        resolveQueued(ids);
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
