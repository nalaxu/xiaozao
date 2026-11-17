// 从流式生成中的 JSON 文本里，逐个取出某个数组字段下已经写完整的对象（技术方案 7.3 流式）。
// 例：'{"dishes":[{"a":1},{"a":' → 先得到 {"a":1}，后一个写完后再得到。

export class ArrayItemExtractor<T = unknown> {
  private buf = "";
  private pos = -1; // 数组内下一次开始扫描的位置；-1 表示还没找到数组开头
  private readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  /** 追加一段文本，返回这一段带来的新完整对象 */
  push(chunk: string): T[] {
    this.buf += chunk;
    if (this.pos < 0) {
      const m = new RegExp(`"${this.key}"\\s*:\\s*\\[`).exec(this.buf);
      if (!m) return [];
      this.pos = m.index + m[0].length;
    }
    const out: T[] = [];
    for (;;) {
      const start = this.buf.indexOf("{", this.pos);
      if (start < 0) return out;
      // 数组已结束则不再取
      const close = this.buf.indexOf("]", this.pos);
      if (close >= 0 && close < start && /^[\s,]*$/.test(this.buf.slice(this.pos, close))) return out;
      const end = matchingBrace(this.buf, start);
      if (end < 0) return out;
      const text = this.buf.slice(start, end + 1);
      this.pos = end + 1;
      try {
        out.push(JSON.parse(text) as T);
      } catch {
        // 不完整或非法的对象跳过，最终结果以完整文本解析为准
      }
    }
  }
}

/** 返回与 start 处 "{" 配对的 "}" 位置，尚未写完则返回 -1；会跳过字符串内的括号 */
function matchingBrace(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return c === "}" ? i : -1;
    }
  }
  return -1;
}
