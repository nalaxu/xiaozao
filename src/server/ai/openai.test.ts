import { afterEach, describe, expect, it, vi } from "vitest";
import { openAiClient, STALL_MS } from "./openai";
import type { ModelRequest } from "./types";

const req: ModelRequest = {
  feature: "followup",
  model: "gpt-6.1-terra",
  system: "s",
  user: [{ type: "text", text: "q" }],
  schema: { name: "x", schema: {} },
  timeoutMs: 60_000,
};

function sse(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const busy = () =>
  sse([{ type: "response.failed", response: { error: { message: "Concurrency limit exceeded for user, please retry later" } } }]);
const ok = () =>
  sse([
    { type: "response.output_text.delta", delta: '{"a":1}' },
    { type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 5 } } },
  ]);

describe("openAiClient retries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries a concurrency refusal that arrives before any output", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const run = openAiClient("k").run(req);
    await vi.advanceTimersByTimeAsync(2500);
    const r = await run;
    expect(r.text).toBe('{"a":1}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when the relay sends nothing for STALL_MS", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    const fetchMock = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const run = openAiClient("k").run(req);
    await vi.advanceTimersByTimeAsync(STALL_MS + 2500);
    expect((await run).text).toBe('{"a":1}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(openAiClient("k").run(req)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after two retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const fetchMock = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal("fetch", fetchMock);
    const run = openAiClient("k").run(req);
    const caught = run.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(String(await caught)).toMatch(/Concurrency limit/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
