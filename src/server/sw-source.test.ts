import { describe, expect, it } from "vitest";
import { serviceWorkerSource } from "./sw-source";

type Handler = (e: unknown) => void;

/** 在假的 Service Worker 环境里执行源码，拿到 fetch 处理函数 */
function load() {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: "https://xz.test" },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {} }), match: async () => undefined, keys: async () => [] };
  new Function("self", "caches", "fetch", serviceWorkerSource("test"))(self, caches, async () => new Response("x"));
  return handlers;
}

function intercepted(handlers: Record<string, Handler>, url: string, extra: Record<string, unknown> = {}) {
  let responded = false;
  handlers.fetch({ request: { method: "GET", url, mode: "cors", destination: "script", ...extra }, respondWith: () => (responded = true) });
  return responded;
}

describe("service worker source", () => {
  it("is valid JavaScript", () => {
    expect(() => new Function(serviceWorkerSource("v1"))).not.toThrow();
  });

  it("caches only hashed build files, not dev files", () => {
    const h = load();
    expect(intercepted(h, "https://xz.test/_next/static/chunks/1255-1622f43a1c0ebec5.js")).toBe(true);
    expect(intercepted(h, "https://xz.test/_next/static/css/55a0ad1f5f595f36.css")).toBe(true);
    expect(intercepted(h, "https://xz.test/_next/static/chunks/app/page.js")).toBe(false);
    expect(intercepted(h, "https://xz.test/icons/icon-192.png", { destination: "" })).toBe(true);
  });

  it("serves the offline shell for page navigations only", () => {
    const h = load();
    expect(intercepted(h, "https://xz.test/t/abc", { mode: "navigate", destination: "document" })).toBe(true);
    expect(intercepted(h, "https://xz.test/api/me", { mode: "navigate", destination: "document" })).toBe(false);
    expect(intercepted(h, "https://xz.test/api/me", { destination: "" })).toBe(false);
  });
});
