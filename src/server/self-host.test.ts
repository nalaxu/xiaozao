// 自建服务器相关的分支：数据库驱动选择、生产环境的本机图片存储。
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isNeonUrl } from "./db/client";
import { getStorage, imageBaseUrl, readDevImage } from "./images/storage";

describe("isNeonUrl", () => {
  it("只有 neon.tech 主机走 Neon 驱动", () => {
    expect(isNeonUrl("postgresql://u:p@ep-cool-1.ap-southeast-1.aws.neon.tech/db?sslmode=require")).toBe(true);
    expect(isNeonUrl("postgresql://howtocook:p@127.0.0.1:5432/howtocook")).toBe(false);
    expect(isNeonUrl("postgresql://u:p@localhost/db")).toBe(false);
    expect(isNeonUrl("postgresql://u:p@neon.tech.evil.com/db")).toBe(false);
    expect(isNeonUrl("not a url")).toBe(false);
  });
});

describe("生产环境的图片存储", () => {
  afterEach(() => vi.unstubAllEnvs());
  const key = "dishes/0b5c6c1e-1111-4222-8333-444455556666/384.webp";

  it("未配置 R2 和 IMAGE_DIR 时报错", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("IMAGE_DIR", "");
    expect(() => getStorage()).toThrow(/图片存储未配置/);
  });

  it("配置了 IMAGE_DIR 时写入本机目录，地址取 IMAGE_BASE_URL", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xz-img-"));
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("R2_ACCOUNT_ID", "");
      vi.stubEnv("IMAGE_DIR", dir);
      vi.stubEnv("IMAGE_BASE_URL", "https://howtocook.example.com/images/");
      await getStorage().put(key, Buffer.from("webp"), "image/webp");
      expect(await readFile(path.join(dir, key), "utf8")).toBe("webp");
      expect(await readDevImage(key)).toEqual(Buffer.from("webp"));
      expect(imageBaseUrl()).toBe("https://howtocook.example.com/images");
      await expect(getStorage().put("../etc/passwd", Buffer.from("x"), "image/webp")).rejects.toThrow(/不合法/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
