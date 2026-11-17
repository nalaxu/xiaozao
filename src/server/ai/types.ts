import type { Feature } from "@config/models";

export type Content =
  | { type: "text"; text: string }
  /** data:image/jpeg;base64,... 只转发，不保存（PRD F5） */
  | { type: "image"; dataUrl: string };

export interface ModelRequest {
  feature: Feature;
  model: string;
  /** 固定不变的系统提示词，放最前以命中缓存（技术方案 7.1） */
  system: string;
  /** 知识库等上下文，放在用户输入之前 */
  context?: string;
  user: Content[];
  schema: { name: string; schema: Record<string, unknown> };
  timeoutMs: number;
  reasoning?: "none" | "low" | "medium" | "high";
}

export interface Usage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface ModelResult {
  text: string;
  usage: Usage;
}

export interface ModelClient {
  /** 调用模型；传入 onDelta 时边生成边回调文本片段 */
  run(req: ModelRequest, onDelta?: (chunk: string) => void): Promise<ModelResult>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "error" | "unavailable",
    readonly usage?: Usage,
  ) {
    super(message);
  }
}

export const ZERO_USAGE: Usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
