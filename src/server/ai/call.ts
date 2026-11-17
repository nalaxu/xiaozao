import "server-only";
import type { Db } from "../db/client";
import { recordCall, reserveBudget } from "../usage";
import { fakeClient } from "./fake";
import { openAiClient } from "./openai";
import { ModelError, ZERO_USAGE, type ModelClient, type ModelRequest, type ModelResult } from "./types";

const g = globalThis as unknown as { __xzModel?: ModelClient };

/**
 * 未配置 OPENAI_API_KEY 时：本地开发与测试用假模型（按知识库拼出结果），线上直接报错。
 * 测试可用 setModelClientForTests 注入。
 */
export function getModelClient(): ModelClient {
  if (g.__xzModel) return g.__xzModel;
  const key = process.env.OPENAI_API_KEY;
  if (key) return (g.__xzModel = openAiClient(key));
  if (process.env.NODE_ENV === "production") {
    return {
      run: async () => {
        throw new ModelError("OPENAI_API_KEY 未配置", "unavailable");
      },
    };
  }
  return (g.__xzModel = fakeClient());
}

export function setModelClientForTests(client: ModelClient | undefined) {
  g.__xzModel = client;
}

export class BudgetPausedError extends Error {
  constructor() {
    super("budget_paused");
  }
}

/** 预占预算 → 调用 → 记账。超过全站上限时抛 BudgetPausedError，模型失败时抛 ModelError（均已记账） */
export async function callModel(
  db: Db,
  userId: string | null,
  req: ModelRequest,
  onDelta?: (chunk: string) => void,
): Promise<ModelResult> {
  const reserved = await reserveBudget(db, req.feature);
  if (reserved === null) throw new BudgetPausedError();
  const started = Date.now();
  try {
    const result = await getModelClient().run(req, onDelta);
    await recordCall(db, {
      userId,
      feature: req.feature,
      model: req.model,
      usage: result.usage,
      latencyMs: Date.now() - started,
      status: "ok",
      reserved,
    });
    return result;
  } catch (e) {
    const err = e instanceof ModelError ? e : new ModelError(e instanceof Error ? e.message : String(e), "error");
    await recordCall(db, {
      userId,
      feature: req.feature,
      model: req.model,
      usage: err.usage ?? ZERO_USAGE,
      latencyMs: Date.now() - started,
      status: err.kind === "timeout" ? "timeout" : "error",
      error: err.message,
      reserved,
    });
    throw err;
  }
}
