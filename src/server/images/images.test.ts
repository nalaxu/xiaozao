import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { budget } from "@config/limits";
import type { Db } from "../db/client";
import { dailySpend, dishes, jobs, modelCalls } from "../db/schema";
import { at, plus, testDb } from "../test-utils";
import { utcDay } from "../usage";
import { setImageGeneratorForTests, type ImageGenerator } from "./generate";
import { MAX_IMAGE_ATTEMPTS, processImageJobs, reclaimStaleJobs } from "./jobs";
import { enqueueImage } from "./queue";
import { setStorageForTests, signS3Put } from "./storage";

let db: Db;
let dishId: string;
const put: string[] = [];
const now = at("2026-11-17T10:00:00Z");

const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#c84" } }).png().toBuffer();
const okGen: ImageGenerator = async () => ({
  png: await png(),
  model: "gpt-image-2",
  usage: { inputTokens: 100, outputTokens: 1000 },
});

beforeEach(async () => {
  db = await testDb();
  put.length = 0;
  setStorageForTests({ put: async (key) => void put.push(key) });
  const [d] = await db
    .insert(dishes)
    .values({ cuisineId: "thai", nameZh: "冬阴功汤", nameZhNorm: "冬阴功汤", nameEn: "Tom yum", visual: "red soup" })
    .returning();
  dishId = d.id;
});

afterEach(() => {
  setStorageForTests(undefined);
  setImageGeneratorForTests(undefined);
});

describe("image jobs", () => {
  it("enqueues a dish once and generates two WebP sizes", async () => {
    setImageGeneratorForTests(okGen);
    expect(await enqueueImage(db, dishId, now)).toBe(true);
    expect(await enqueueImage(db, dishId, now)).toBe(false);
    expect(await processImageJobs(db, { now })).toMatchObject({ done: 1 });
    expect(put.sort()).toEqual([`dishes/${dishId}/384.webp`, `dishes/${dishId}/768.webp`]);
    const [d] = await db.select().from(dishes).where(eq(dishes.id, dishId));
    expect(d.imageStatus).toBe("ready");
    expect(d.imageKey).toBe(`dishes/${dishId}`);
    const [call] = await db.select().from(modelCalls);
    // 100 × $5 + 1000 × $30，每百万
    expect(call.costUsd).toBeCloseTo(0.0305, 6);
    expect(call.imageCount).toBe(1);
  });

  it("retries twice and then marks the dish failed", async () => {
    setImageGeneratorForTests(async () => {
      throw new Error("model down");
    });
    await enqueueImage(db, dishId, now);
    let t = now;
    for (let i = 0; i < MAX_IMAGE_ATTEMPTS; i++) {
      expect(await processImageJobs(db, { now: t })).toMatchObject({ failed: 1 });
      t = plus(t, 3600);
    }
    const [d] = await db.select().from(dishes).where(eq(dishes.id, dishId));
    expect(d.imageStatus).toBe("failed");
    const [job] = await db.select().from(jobs);
    expect(job.status).toBe("failed");
    expect(job.lastError).toContain("model down");
    expect(await processImageJobs(db, { now: t })).toMatchObject({ done: 0, failed: 0 });
  });

  it("postpones new images to the next day once spend reaches the threshold", async () => {
    setImageGeneratorForTests(okGen);
    await db.insert(dailySpend).values({ day: utcDay(now), actualUsd: budget.stopImagesUsd });
    await enqueueImage(db, dishId, now);
    expect(await processImageJobs(db, { now })).toMatchObject({ postponed: 1 });
    const [job] = await db.select().from(jobs);
    expect(job.runAfter.toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(put).toHaveLength(0);
  });

  it("reclaims jobs whose lease expired", async () => {
    let release: () => void = () => {};
    setImageGeneratorForTests(() => new Promise((_, reject) => (release = () => reject(new Error("killed")))));
    await enqueueImage(db, dishId, now);
    const running = processImageJobs(db, { now });
    await new Promise((r) => setTimeout(r, 200));
    expect(await reclaimStaleJobs(db, plus(now, 60))).toBe(0);
    expect(await reclaimStaleJobs(db, plus(now, 6 * 60))).toBe(1);
    const [d] = await db.select().from(dishes).where(eq(dishes.id, dishId));
    expect(d.imageStatus).toBe("queued");
    release();
    await running;
  });
});

describe("signS3Put", () => {
  it("produces a SigV4 authorization header over the sorted signed headers", () => {
    const headers = signS3Put({
      host: "acc.r2.cloudflarestorage.com",
      path: "/bucket/dishes/x/384.webp",
      body: Buffer.from("hello"),
      contentType: "image/webp",
      accessKeyId: "AKID",
      secretAccessKey: "secret",
      region: "auto",
      now: at("2026-11-17T10:00:00Z"),
      extraHeaders: { "Cache-Control": "public" },
    });
    expect(headers["x-amz-date"]).toBe("20261117T100000Z");
    expect(headers["x-amz-content-sha256"]).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/20261117\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(headers.host).toBeUndefined();
  });
});
