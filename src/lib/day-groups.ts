// 历史按本地日期分组（设计文档 4.8）。
function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayLabel(d: Date, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

/** 按日期分组，保持原有顺序（调用方已按时间倒序） */
export function groupByDay<T>(items: T[], at: (t: T) => string, now = new Date()) {
  const groups: { label: string; items: T[] }[] = [];
  let last = "";
  for (const item of items) {
    const d = new Date(at(item));
    const k = dayKey(d);
    if (k !== last) {
      groups.push({ label: dayLabel(d, now), items: [] });
      last = k;
    }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}
