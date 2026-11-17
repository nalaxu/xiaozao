// 离线保存的教程（技术方案第 11 节）：收藏的全部保留，其余只留最近打开的 5 份。
// 教程正文存 IndexedDB，菜品图存 Cache Storage（Service Worker 离线时从这里取图）。
import type { TutorialContent } from "./tutorial-types";
import type { UnitSystem } from "./units";

export interface OfflineTutorial {
  id: string;
  dish: { id: string; nameZh: string; cuisineId: string; imageUrl: string | null };
  cuisine?: { zh: string; color: string };
  content: TutorialContent;
  units: UnitSystem;
  favorite: boolean;
  cookedAt: string | null;
  /** 最近一次打开的时间（毫秒） */
  openedAt: number;
}

export const RECENT_LIMIT = 5;
export const IMAGE_CACHE = "xz-images";
const DB_NAME = "xiaozao";
const STORE = "tutorials";

/** 384 尺寸缩略图地址（图片按 dishes/<id>/<尺寸>.webp 存放） */
export function thumbOf(url: string | null) {
  return url ? url.replace(/\/768\.webp$/, "/384.webp") : null;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      resolve(undefined);
    };
  });
}

export async function listOffline(): Promise<OfflineTutorial[]> {
  try {
    const all = (await withStore<OfflineTutorial[]>("readonly", (s) => s.getAll())) ?? [];
    return all.sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export async function getOffline(id: string): Promise<OfflineTutorial | undefined> {
  try {
    return await withStore<OfflineTutorial>("readonly", (s) => s.get(id));
  } catch {
    return undefined;
  }
}

/** 哪些记录该删：非收藏的只留最近打开的 limit 份 */
export function toPrune(list: Pick<OfflineTutorial, "id" | "favorite" | "openedAt">[], limit = RECENT_LIMIT): string[] {
  return [...list]
    .filter((t) => !t.favorite)
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(limit)
    .map((t) => t.id);
}

async function cacheImages(urls: (string | null)[]) {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(IMAGE_CACHE);
    await Promise.all(
      urls.filter((u): u is string => Boolean(u)).map(async (u) => {
        if (await cache.match(u)) return;
        // 图片在 R2（跨域），用 no-cors 取回不透明响应，<img> 可以直接用
        const res = await fetch(u, { mode: "no-cors" }).catch(() => null);
        if (res && (res.ok || res.type === "opaque")) await cache.put(u, res);
      }),
    );
  } catch {}
}

async function dropImages(records: OfflineTutorial[]) {
  if (typeof caches === "undefined" || !records.length) return;
  try {
    const keep = new Set((await listOffline()).map((t) => t.dish.imageUrl));
    const cache = await caches.open(IMAGE_CACHE);
    for (const r of records) {
      if (!r.dish.imageUrl || keep.has(r.dish.imageUrl)) continue;
      await cache.delete(r.dish.imageUrl);
      const thumb = thumbOf(r.dish.imageUrl);
      if (thumb) await cache.delete(thumb);
    }
  } catch {}
}

async function prune() {
  const list = await listOffline();
  const ids = new Set(toPrune(list));
  if (!ids.size) return;
  await withStore("readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
  await dropImages(list.filter((t) => ids.has(t.id)));
}

/** 打开教程或进入烹饪模式时调用：存下正文和图片 */
export async function saveOffline(record: Omit<OfflineTutorial, "openedAt">) {
  try {
    const existing = await getOffline(record.id);
    const next: OfflineTutorial = { ...record, openedAt: Date.now() };
    // 图片可能是后来才生成好的，保留已有的地址
    if (!next.dish.imageUrl && existing?.dish.imageUrl) next.dish = { ...next.dish, imageUrl: existing.dish.imageUrl };
    await withStore("readwrite", (s) => s.put(next));
    await cacheImages([next.dish.imageUrl, thumbOf(next.dish.imageUrl)]);
    await prune();
  } catch {}
}

export async function setOfflineFavorite(id: string, favorite: boolean) {
  try {
    const t = await getOffline(id);
    if (!t) return;
    await withStore("readwrite", (s) => s.put({ ...t, favorite }));
    if (!favorite) await prune();
  } catch {}
}

/**
 * 与服务端的收藏列表对齐：收藏了但本机没有的下载下来，本机标为收藏但已取消的改回普通记录。
 * fetchOne 返回 null 表示取不到（例如离线），跳过即可。
 */
export async function syncFavorites(
  favoriteIds: string[],
  fetchOne: (id: string) => Promise<Omit<OfflineTutorial, "openedAt"> | null>,
) {
  try {
    const want = new Set(favoriteIds);
    const local = await listOffline();
    const have = new Map(local.map((t) => [t.id, t]));
    for (const t of local) {
      if (t.favorite && !want.has(t.id)) await withStore("readwrite", (s) => s.put({ ...t, favorite: false }));
      if (!t.favorite && want.has(t.id)) await withStore("readwrite", (s) => s.put({ ...t, favorite: true }));
    }
    for (const id of favoriteIds) {
      if (have.has(id)) continue;
      const rec = await fetchOne(id);
      if (!rec) continue;
      // 下载的收藏不算“最近打开”，排在最后
      await withStore("readwrite", (s) => s.put({ ...rec, favorite: true, openedAt: 0 }));
      await cacheImages([rec.dish.imageUrl, thumbOf(rec.dish.imageUrl)]);
    }
    await prune();
  } catch {}
}

/** 退出登录时清空本机保存的教程和图片 */
export async function clearOffline() {
  try {
    if (typeof indexedDB !== "undefined") {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    }
    if (typeof caches !== "undefined") await caches.delete(IMAGE_CACHE);
  } catch {}
}

/** 教程接口（GET /api/tutorials/[id]）或页面数据转成离线记录；未生成完的返回 null */
export function toOfflineRecord(t: {
  id: string;
  status: string;
  content: TutorialContent | null;
  units: UnitSystem;
  favorite: boolean;
  cookedAt: string | null;
  dish: { id: string; nameZh: string; cuisineId: string; imageUrl: string | null };
  cuisine?: { zh: string; color: string } | null;
}): Omit<OfflineTutorial, "openedAt"> | null {
  if (t.status !== "done" || !t.content) return null;
  return {
    id: t.id,
    dish: { id: t.dish.id, nameZh: t.dish.nameZh, cuisineId: t.dish.cuisineId, imageUrl: t.dish.imageUrl },
    cuisine: t.cuisine ?? undefined,
    content: t.content,
    units: t.units,
    favorite: t.favorite,
    cookedAt: t.cookedAt,
  };
}

export async function fetchOfflineRecord(id: string) {
  try {
    const res = await fetch(`/api/tutorials/${id}`);
    if (!res.ok) return null;
    return toOfflineRecord(await res.json());
  } catch {
    return null;
  }
}
