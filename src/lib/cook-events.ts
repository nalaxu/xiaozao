// 烹饪模式里的“进入 / 做好了”记录与评价。离线时先存在本机，联网后补发（烹饪模式不显示网络错误）。
import type { Verdict } from "./preference-options";

const KEY = "xz_pending_cook";

type Pending =
  | { type?: "cook"; id: string; event: "start" | "complete" }
  | { type: "rating"; id: string; verdict: Verdict; reason: string | null };

function read(): Pending[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
    else localStorage.removeItem(KEY);
  } catch {}
}

async function send(p: Pending): Promise<boolean> {
  try {
    const res =
      p.type === "rating"
        ? await fetch("/api/ratings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tutorialId: p.id, verdict: p.verdict, reason: p.reason }),
            keepalive: true,
          })
        : await fetch(`/api/tutorials/${p.id}/cook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: p.event }),
            keepalive: true,
          });
    // 4xx（例如教程不存在、已退出登录）重发也没用，直接丢弃
    return res.ok || (res.status >= 400 && res.status < 500);
  } catch {
    return false;
  }
}

async function sendOrQueue(p: Pending) {
  if (await send(p)) return;
  // 同一份教程的评价只留最新一条
  const rest = p.type === "rating" ? read().filter((x) => !(x.type === "rating" && x.id === p.id)) : read();
  write([...rest, p]);
}

export async function recordCookEvent(id: string, event: "start" | "complete") {
  await sendOrQueue({ type: "cook", id, event });
}

export async function recordRating(id: string, verdict: Verdict, reason: string | null) {
  await sendOrQueue({ type: "rating", id, verdict, reason });
}

let flushing: Promise<void> | null = null;

export function flushCookEvents() {
  // 同时只跑一次，免得重复补发
  flushing ??= (async () => {
    const list = read();
    if (list.length) {
      const left: Pending[] = [];
      for (const p of list) if (!(await send(p))) left.push(p);
      write(left);
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
