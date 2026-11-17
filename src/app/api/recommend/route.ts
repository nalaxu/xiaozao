import type { NextRequest } from "next/server";
import { z } from "zod";
import { input as limits } from "@config/limits";
import { kb } from "@/lib/kb";
import type { RecommendEvent } from "@/lib/recommend-types";
import { jsonError, readJson } from "@/server/http";
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: RecommendEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runRecommend(db, user, parsed.data, emit);
      } catch (e) {
        console.error("recommend route failed", e);
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
