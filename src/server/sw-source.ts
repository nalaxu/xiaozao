// Service Worker 的源码（技术方案第 11 节），由 src/app/sw.js/route.ts 提供。
// 单独成文件以便测试：模板字符串里的正则要双写反斜杠，写错了浏览器会拒绝注册。
export function serviceWorkerSource(version: string) {
  return `
const VERSION = ${JSON.stringify(version)};
const SHELL = "xz-shell-" + VERSION;
const IMAGES = "xz-images";
const OFFLINE_URL = "/offline";
const EXTRA = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const res = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
      if (!res.ok) throw new Error("offline shell " + res.status);
      const html = await res.clone().text();
      await cache.put(OFFLINE_URL, res);
      const assets = new Set(EXTRA);
      for (const m of html.matchAll(/\\/_next\\/static\\/[^"'\\s\\\\)]+/g)) assets.add(m[0]);
      await cache.addAll([...assets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL && key !== IMAGES) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (req.destination === "image") {
    event.respondWith(
      caches
        .open(IMAGES)
        .then((c) => c.match(req.url))
        .then((hit) => hit || fetch(req)),
    );
    return;
  }

  // 只缓存带哈希的构建产物（开发模式的文件名不带哈希，缓存会拿到旧代码）
  const hashed = url.pathname.startsWith("/_next/static/") && /[-.\\/][0-9a-f]{8,}\\.(js|css|woff2)$|\\/media\\//.test(url.pathname);
  if (sameOrigin && (hashed || url.pathname.startsWith("/icons/"))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate" && sameOrigin && !url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE_URL, { cacheName: SHELL })) || Response.error()),
    );
  }
});
`;
}
