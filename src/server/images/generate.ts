// 生成菜品示意图（技术方案 8.2）：统一的风格模板 + 菜名 + 推荐时的外观描述。
import sharp from "sharp";
import { imageQuality, modelFor } from "@config/models";

export const IMAGE_TIMEOUT_MS = 120_000;

export const IMAGE_STYLE =
  "Home-style plating on a simple plate or bowl, photographed from a 45-degree angle in soft natural daylight, " +
  "on a light wooden or linen tabletop. Realistic food photography, appetizing but not overly styled. " +
  "No text, no labels, no watermark, no hands, no people.";

export function imagePrompt(d: { nameZh: string; nameEn: string; visual: string | null }): string {
  return `${d.nameEn} (${d.nameZh}). ${d.visual ?? ""} ${IMAGE_STYLE}`.replace(/\s+/g, " ").trim();
}

export interface GeneratedImage {
  png: Buffer;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type ImageGenerator = (prompt: string, d: { nameZh: string; cuisineColor?: string }) => Promise<GeneratedImage>;

const openAiGenerator: ImageGenerator = async (prompt) => {
  const model = modelFor("image");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size: "1024x1024", quality: imageQuality(), n: 1, output_format: "png" }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { b64_json?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!res.ok || !b64) throw new Error(`图片生成失败 ${res.status}: ${data.error?.message ?? "无图片"}`);
    return {
      png: Buffer.from(b64, "base64"),
      model,
      usage: data.usage
        ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
        : null,
    };
  } finally {
    clearTimeout(timer);
  }
};

/** 本地开发用：画一张带菜名的色块图，验证生成、存储与前端替换流程 */
const fakeGenerator: ImageGenerator = async (_prompt, d) => {
  await new Promise((r) => setTimeout(r, 3000));
  const name = d.nameZh.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <defs><radialGradient id="g"><stop offset="0" stop-color="#f6e7d2"/><stop offset="1" stop-color="#c9a27a"/></radialGradient></defs>
    <rect width="1024" height="1024" fill="#efe6da"/>
    <circle cx="512" cy="540" r="380" fill="#fff"/><circle cx="512" cy="540" r="300" fill="url(#g)"/>
    <text x="512" y="560" font-size="72" text-anchor="middle" fill="#5a3b22" font-family="PingFang SC, sans-serif">${name}</text>
    <text x="512" y="150" font-size="36" text-anchor="middle" fill="#8a7a6a" font-family="sans-serif">dev placeholder</text>
  </svg>`;
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), model: "fake-image", usage: { inputTokens: 0, outputTokens: 0 } };
};

const g = globalThis as unknown as { __xzImageGen?: ImageGenerator };

export function getImageGenerator(): ImageGenerator {
  if (g.__xzImageGen) return g.__xzImageGen;
  if (process.env.OPENAI_API_KEY) return openAiGenerator;
  if (process.env.NODE_ENV === "production") {
    return async () => {
      throw new Error("OPENAI_API_KEY 未配置");
    };
  }
  return fakeGenerator;
}

export function setImageGeneratorForTests(gen: ImageGenerator | undefined) {
  g.__xzImageGen = gen;
}

/** 转成两种尺寸的 WebP：768 用于教程顶部，384 用于卡片 */
export async function toWebpSizes(png: Buffer): Promise<{ 768: Buffer; 384: Buffer }> {
  const [a, b] = await Promise.all([
    sharp(png).resize(768, 768, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
    sharp(png).resize(384, 384, { fit: "cover" }).webp({ quality: 78 }).toBuffer(),
  ]);
  return { 768: a, 384: b };
}
