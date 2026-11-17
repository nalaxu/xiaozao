// 烹饪模式的“进入 / 做好了”记录。离线时先存在本机，联网后补发（烹饪模式不显示网络错误）。
const KEY = "xz_pending_cook";

type Pending = { id: string; event: "start" | "complete" };

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
    const res = await fetch(`/api/tutorials/${p.id}/cook`, {
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

export async function recordCookEvent(id: string, event: Pending["event"]) {
  if (!(await send({ id, event }))) write([...read(), { id, event }]);
}

export async function flushCookEvents() {
  const list = read();
  if (!list.length) return;
  const left: Pending[] = [];
  for (const p of list) if (!(await send(p))) left.push(p);
  write(left);
}
