"use client";

// 没有图的菜每 4 秒查询一次，最多 90 秒，拿到地址即替换（技术方案 8.3）。
import { useEffect, useState } from "react";

const INTERVAL_MS = 4000;
const MAX_MS = 90_000;

export function useDishImages(dishes: { dishId: string; imageUrl: string | null }[], size: 384 | 768 = 384) {
  const [found, setFound] = useState<Record<string, string>>({});
  const missing = dishes
    .filter((d) => !d.imageUrl && !found[d.dishId])
    .map((d) => d.dishId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!missing) return;
    const started = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/dishes/images?ids=${missing}&size=${size}`);
        const data = (await res.json()) as { images: Record<string, string | null> };
        const ready = Object.entries(data.images).filter((e): e is [string, string] => Boolean(e[1]));
        if (!stopped && ready.length) setFound((f) => ({ ...f, ...Object.fromEntries(ready) }));
      } catch {
        // 网络问题时下次再试
      }
      if (!stopped && Date.now() - started < MAX_MS) timer = setTimeout(poll, INTERVAL_MS);
    };
    timer = setTimeout(poll, INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [missing, size]);

  return (dishId: string, url: string | null) => url ?? found[dishId] ?? null;
}
