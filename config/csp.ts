// 内容安全策略（技术方案第 12 节）：只允许本站、R2 图片域、Turnstile。
// Next.js 的页面会内联脚本（水合数据），不用 nonce 就必须允许 'unsafe-inline'；
// 用 nonce 需要所有页面动态渲染，会让离线外壳等静态页失效，第一版不做。其余来源全部收紧。
const TURNSTILE = "https://challenges.cloudflare.com";

function origin(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ dev, imageBaseUrl }: { dev: boolean; imageBaseUrl?: string }) {
  const images = origin(imageBaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(images ? [images] : [])],
    "font-src": ["'self'", "data:"],
    // 离线保存菜品图时会 fetch R2 上的图片
    "connect-src": ["'self'", TURNSTILE, ...(images ? [images] : []), ...(dev ? ["ws:"] : [])],
    "frame-src": [TURNSTILE],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}
