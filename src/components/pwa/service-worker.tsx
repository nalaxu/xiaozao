"use client";

import { useEffect } from "react";
import { flushCookEvents } from "@/lib/cook-events";

// 只在生产构建注册 Service Worker；开发时注销残留的，避免缓存旧代码
export function ServiceWorker() {
  // 断网时没发出去的烹饪记录，回到任何页面且联网时补发
  useEffect(() => {
    void flushCookEvents();
    const onOnline = () => void flushCookEvents();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      void caches?.keys().then((keys) => keys.filter((k) => k.startsWith("xz-shell")).forEach((k) => void caches.delete(k)));
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
