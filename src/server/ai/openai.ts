// OpenAI Responses API，直接用 fetch 调用（结构化输出 + 流式）。技术方案 7.1。
import { ModelError, ZERO_USAGE, type Content, type ModelClient, type ModelRequest, type Usage } from "./types";

/** OpenAI 兼容接口地址，可用 OPENAI_BASE_URL 换成代理或中转（需包含 /v1） */
export const openAiBaseUrl = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

function toInput(req: ModelRequest) {
  const content = req.user.map((c) =>
    c.type === "text" ? { type: "input_text", text: c.text } : { type: "input_image", image_url: c.dataUrl, detail: "auto" },
  );
  const messages: unknown[] = [];
  if (req.context) messages.push({ role: "developer", content: [{ type: "input_text", text: req.context }] });
  messages.push({ role: "user", content });
  return messages;
}

function readUsage(u: unknown): Usage {
  const usage = (u ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  return {
    inputTokens: usage.input_tokens ?? 0,
    cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

export function openAiClient(apiKey: string): ModelClient {
  return {
    async run(req, onDelta) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
      const body = {
        model: req.model,
        instructions: req.system,
        input: toInput(req),
        stream: true,
        store: false,
        text: { format: { type: "json_schema", name: req.schema.name, schema: req.schema.schema, strict: true } },
        ...(req.reasoning ? { reasoning: { effort: req.reasoning } } : {}),
      };
      let text = "";
      let usage: Usage = ZERO_USAGE;
      try {
        const res = await fetch(`${openAiBaseUrl()}/responses`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new ModelError(`OpenAI ${res.status}: ${detail.slice(0, 300)}`, "error");
        }
        let completed = false;
        for await (const event of sseEvents(res.body)) {
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            text += event.delta;
            onDelta?.(event.delta);
          } else if (event.type === "response.completed") {
            const r = event.response as { usage?: unknown };
            usage = readUsage(r?.usage);
            completed = true;
          } else if (event.type === "response.incomplete" || event.type === "response.failed") {
            const r = event.response as { usage?: unknown; error?: { message?: string }; incomplete_details?: unknown };
            usage = readUsage(r?.usage);
            throw new ModelError(
              `OpenAI ${event.type}: ${r?.error?.message ?? JSON.stringify(r?.incomplete_details ?? {})}`,
              "error",
              usage,
            );
          } else if (event.type === "error") {
            throw new ModelError(`OpenAI error: ${JSON.stringify(event).slice(0, 300)}`, "error", usage);
          }
        }
        if (!completed) throw new ModelError("OpenAI 流意外结束", "error", usage);
        return { text, usage };
      } catch (e) {
        if (e instanceof ModelError) throw e;
        if (ctrl.signal.aborted) throw new ModelError("模型调用超时", "timeout", usage);
        throw new ModelError(e instanceof Error ? e.message : String(e), "error", usage);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** 解析 text/event-stream，逐个产出 data 字段的 JSON */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += value ? decoder.decode(value, { stream: true }) : decoder.decode();
    let sep: number;
    while ((sep = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep).replace(/^\r?\n\r?\n/, "");
      const data = raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data) as Record<string, unknown>;
      } catch {
        // 忽略无法解析的事件
      }
    }
    if (done) return;
  }
}

export type { Content };
