// Service Worker（技术方案第 11 节）。每次部署版本号不同，浏览器会自动更新并清掉旧缓存。
// 策略：
// - 页面：先走网络，断网时返回离线外壳 /offline，由它从本机 IndexedDB 读出教程；
// - /_next/static（带哈希）、图标：缓存优先；
// - 菜品图：本机保存过的（xz-images）直接用缓存，其余走网络。
export const dynamic = "force-static";

const VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

const source = `
const VERSION = ${JSON.stringify(VERSION)};
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
  const hashed = url.pathname.startsWith("/_next/static/") && /[-./][0-9a-f]{8,}\.(js|css|woff2)$|\/media\//.test(url.pathname);
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

export function GET() {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
