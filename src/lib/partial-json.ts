// 解析还没写完的 JSON（技术方案 7.4 流式）：补齐未闭合的字符串和括号，
// 补不齐时退回到最近一个完整值之后。用于教程边生成边显示。

interface SafePoint {
  pos: number;
  closers: string;
}

export function parsePartialJson<T = unknown>(text: string): T | undefined {
  const stack: string[] = [];
  let inStr = false;
  let safe: SafePoint | null = null;
  const closers = () =>
    stack
      .slice()
      .reverse()
      .map((c) => (c === "{" ? "}" : "]"))
      .join("");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") {
      stack.push(c);
      safe = { pos: i + 1, closers: closers() };
    } else if (c === "}" || c === "]") {
      stack.pop();
      safe = { pos: i + 1, closers: closers() };
    } else if (c === ",") {
      safe = { pos: i, closers: closers() };
    }
  }

  // 先尝试只补齐当前字符串与括号，这样正在写的那段文字也能显示
  const tail = text.replace(/[\s,]+$/, "");
  const attempt = (s: string) => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return undefined;
    }
  };
  const direct = attempt(tail + (inStr ? '"' : "") + closers());
  if (direct !== undefined) return direct;
  if (inStr) {
    // 去掉悬空的反斜杠后再试
    const fixed = attempt(tail.replace(/\\+$/, (m) => (m.length % 2 ? m.slice(1) : m)) + '"' + closers());
    if (fixed !== undefined) return fixed;
  }
  if (!safe) return undefined;
  return attempt(text.slice(0, safe.pos).replace(/[\s,]+$/, "") + safe.closers);
}
