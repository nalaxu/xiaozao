// 图片存储：线上写 Cloudflare R2（S3 兼容接口，自己做 SigV4 签名，不引入 AWS SDK）；
// 本地开发未配置 R2 时写到 .data/images，经 /api/dev-images 读取。
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ImageStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

const DEV_DIR = path.join(process.cwd(), ".data", "images");
const isProd = () => process.env.NODE_ENV === "production";

const r2Configured = () =>
  Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET,
  );

/** 图片对外地址前缀；本地开发未配置时指向开发用接口 */
export function imageBaseUrl(): string | null {
  const base = process.env.IMAGE_BASE_URL;
  if (base) return base.replace(/\/$/, "");
  return isProd() ? null : "/api/dev-images";
}

const sha256hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** 计算 S3 SigV4 签名所需的请求头（导出以便测试） */
export function signS3Put(opts: {
  host: string;
  path: string;
  body: Buffer;
  contentType: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  now: Date;
  extraHeaders?: Record<string, string>;
}): Record<string, string> {
  const amzDate = opts.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256hex(opts.body);
  const headers: Record<string, string> = {
    "content-type": opts.contentType,
    host: opts.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(opts.extraHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const names = Object.keys(headers).sort();
  const canonical = [
    "PUT",
    opts.path,
    "",
    ...names.map((n) => `${n}:${headers[n].trim()}`),
    "",
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${date}/${opts.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${opts.secretAccessKey}`, date), opts.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  const { host: _host, ...rest } = headers;
  void _host;
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

const r2Storage: ImageStorage = {
  async put(key, body, contentType) {
    const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const objectPath = `/${process.env.R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const headers = signS3Put({
      host,
      path: objectPath,
      body,
      contentType,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      region: "auto",
      now: new Date(),
      extraHeaders: { "cache-control": "public, max-age=31536000, immutable" },
    });
    const res = await fetch(`https://${host}${objectPath}`, { method: "PUT", headers, body: new Uint8Array(body) });
    if (!res.ok) throw new Error(`R2 上传失败 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

const devStorage: ImageStorage = {
  async put(key, body) {
    const file = path.join(DEV_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  },
};

/** 开发用：读取本地图片；key 只允许 dishes/<uuid>/<尺寸>.webp */
export async function readDevImage(key: string): Promise<Buffer | null> {
  if (!/^dishes\/[0-9a-f-]{36}\/(384|768)\.webp$/.test(key)) return null;
  try {
    return await readFile(path.join(DEV_DIR, key));
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __xzStorage?: ImageStorage };

export function getStorage(): ImageStorage {
  if (g.__xzStorage) return g.__xzStorage;
  if (r2Configured()) return r2Storage;
  if (isProd()) throw new Error("R2 未配置");
  return devStorage;
}

export function setStorageForTests(s: ImageStorage | undefined) {
  g.__xzStorage = s;
}
