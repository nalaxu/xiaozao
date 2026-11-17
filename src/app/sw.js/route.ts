// Service Worker（技术方案第 11 节）。每次部署版本号不同，浏览器会自动更新并清掉旧缓存。
// 策略：
// - 页面：先走网络，断网时返回离线外壳 /offline，由它从本机 IndexedDB 读出教程；
// - /_next/static（带哈希）、图标：缓存优先；
// - 菜品图：本机保存过的（xz-images）直接用缓存，其余走网络。
import { serviceWorkerSource } from "@/server/sw-source";

export const dynamic = "force-static";

const source = serviceWorkerSource(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev");

export function GET() {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
