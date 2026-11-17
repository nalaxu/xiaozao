import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { at, mailbox, plus, testDb } from "../test-utils";
import { startEmailOtp, verifyEmailOtp } from "./otp";

let db: Db;
const t0 = at("2026-11-17T10:00:00Z");

beforeEach(async () => {
  db = await testDb();
});

describe("邮箱验证码（PRD 4.6）", () => {
  it("发送后可用一次，第二次使用失败", async () => {
    const mail = mailbox();
    expect(await startEmailOtp(db, { email: "A@Example.com ", ip: "1.1.1.1" }, mail.send, t0)).toEqual({ ok: true });
    const code = mail.lastCode("a@example.com")!;
    expect(code).toMatch(/^\d{6}$/);

    expect(await verifyEmailOtp(db, { email: "a@example.com", code }, plus(t0, 30))).toEqual({
      ok: true,
      email: "a@example.com",
    });
    expect((await verifyEmailOtp(db, { email: "a@example.com", code }, plus(t0, 31))).ok).toBe(false);
  });

  it("10 分钟后过期", async () => {
    const mail = mailbox();
    await startEmailOtp(db, { email: "a@x.com", ip: "1.1.1.1" }, mail.send, t0);
    const code = mail.lastCode("a@x.com")!;
    expect((await verifyEmailOtp(db, { email: "a@x.com", code }, plus(t0, 601))).ok).toBe(false);
  });

  it("60 秒内不能重发，之后新码发出旧码失效", async () => {
    const mail = mailbox();
    await startEmailOtp(db, { email: "a@x.com", ip: "1.1.1.1" }, mail.send, t0);
    const first = mail.lastCode("a@x.com")!;

    const tooSoon = await startEmailOtp(db, { email: "a@x.com", ip: "1.1.1.1" }, mail.send, plus(t0, 20));
    expect(tooSoon).toEqual({ ok: false, reason: "rate_limited", retryAfter: 40 });

    await startEmailOtp(db, { email: "a@x.com", ip: "1.1.1.1" }, mail.send, plus(t0, 61));
    const second = mail.lastCode("a@x.com")!;
    if (first !== second) {
      expect((await verifyEmailOtp(db, { email: "a@x.com", code: first }, plus(t0, 62))).ok).toBe(false);
    }
    expect((await verifyEmailOtp(db, { email: "a@x.com", code: second }, plus(t0, 63))).ok).toBe(true);
  });

  it("输错 5 次后验证码作废，正确的码也不能再用", async () => {
    const mail = mailbox();
    await startEmailOtp(db, { email: "a@x.com", ip: "1.1.1.1" }, mail.send, t0);
    const code = mail.lastCode("a@x.com")!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await verifyEmailOtp(db, { email: "a@x.com", code: wrong }, plus(t0, 10 + i))).ok).toBe(false);
    }
    expect((await verifyEmailOtp(db, { email: "a@x.com", code }, plus(t0, 20))).ok).toBe(false);
  });

  it("同一邮箱每小时最多 5 次", async () => {
    const mail = mailbox();
    for (let i = 0; i < 5; i++) {
      const r = await startEmailOtp(db, { email: "a@x.com", ip: `10.0.0.${i}` }, mail.send, plus(t0, i * 61));
      expect(r.ok).toBe(true);
    }
    const sixth = await startEmailOtp(db, { email: "a@x.com", ip: "10.0.0.9" }, mail.send, plus(t0, 5 * 61));
    expect(sixth.ok).toBe(false);
    expect(mail.sent).toHaveLength(5);
  });

  it("同一 IP 每小时最多 10 次", async () => {
    const mail = mailbox();
    for (let i = 0; i < 10; i++) {
      expect((await startEmailOtp(db, { email: `u${i}@x.com`, ip: "9.9.9.9" }, mail.send, plus(t0, i))).ok).toBe(true);
    }
    expect((await startEmailOtp(db, { email: "u10@x.com", ip: "9.9.9.9" }, mail.send, plus(t0, 11))).ok).toBe(false);
  });

  it("别的邮箱的验证码不能用", async () => {
    const mail = mailbox();
    await startEmailOtp(db, { email: "a@x.com", ip: "1.1.1.1" }, mail.send, t0);
    const code = mail.lastCode("a@x.com")!;
    expect((await verifyEmailOtp(db, { email: "b@x.com", code }, plus(t0, 5))).ok).toBe(false);
  });
});
