import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInviteCodes, inviteFromWaitlist, listWaitlist, revokeInviteCode } from "../admin";
import type { Db } from "../db/client";
import { inviteCodes, users } from "../db/schema";
import { at, plus, testDb } from "../test-utils";
import { createSession, userForSession } from "./session";
import { applyForInvite, checkInviteCode, redeemInvite, resolveVerifiedIdentity } from "./signup";

let db: Db;
const t0 = at("2026-11-17T10:00:00Z");

beforeEach(async () => {
  db = await testDb();
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

async function newCode(opts: { maxUses?: number; days?: number | null } = {}) {
  const [c] = await createInviteCodes(
    db,
    { count: 1, maxUses: opts.maxUses ?? 1, expiresInDays: opts.days ?? 30, note: null, createdBy: null },
    t0,
  );
  return c;
}

async function pendingFor(email: string, via: "email" | "google" = "email", googleSub?: string) {
  const r = await resolveVerifiedIdentity(db, { email, via, googleSub }, t0);
  if (r.kind !== "pending") throw new Error(`期望 pending，得到 ${r.kind}`);
  return r.pendingId;
}

describe("邀请码注册（F32）", () => {
  it("新邮箱验证后进入待填邀请码，填有效码后建号", async () => {
    const code = await newCode();
    const pendingId = await pendingFor("New@X.com");
    const r = await redeemInvite(db, { pendingId, code: code.code.toLowerCase(), ip: "1.1.1.1" }, plus(t0, 60));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.user.email).toBe("new@x.com");
    expect(r.user.inviteCodeId).toBe(code.id);
    expect(r.user.role).toBe("user");

    // 再次验证同一邮箱时直接是已有账号
    const again = await resolveVerifiedIdentity(db, { email: "new@x.com", via: "email" }, plus(t0, 120));
    expect(again.kind).toBe("user");
  });

  it("邀请码忽略大小写、空格与连字符", async () => {
    const code = await newCode();
    const pendingId = await pendingFor("a@x.com");
    const messy = ` ${code.code.slice(0, 4)}-${code.code.slice(4).toLowerCase()} `;
    expect((await redeemInvite(db, { pendingId, code: messy, ip: "1.1.1.1" }, t0)).ok).toBe(true);
  });

  it("单次码用完后第二个人不能用", async () => {
    const code = await newCode({ maxUses: 1 });
    const p1 = await pendingFor("a@x.com");
    const p2 = await pendingFor("b@x.com");
    expect((await redeemInvite(db, { pendingId: p1, code: code.code, ip: "1.1.1.1" }, t0)).ok).toBe(true);
    expect(await redeemInvite(db, { pendingId: p2, code: code.code, ip: "2.2.2.2" }, t0)).toEqual({
      ok: false,
      reason: "invalid_code",
    });
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, code.id));
    expect(row.usedCount).toBe(1);
  });

  it("并发兑换同一个单次码，只有一个成功", async () => {
    const code = await newCode({ maxUses: 1 });
    const ids = await Promise.all(["a@x.com", "b@x.com", "c@x.com"].map((e) => pendingFor(e)));
    const results = await Promise.all(
      ids.map((pendingId, i) => redeemInvite(db, { pendingId, code: code.code, ip: `3.3.3.${i}` }, t0)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("作废、不存在的码无效", async () => {
    const revoked = await newCode();
    await revokeInviteCode(db, revoked.id, t0);
    const pendingId = await pendingFor("a@x.com");
    for (const code of [revoked.code, "ZZZZZZZZ"]) {
      expect(await redeemInvite(db, { pendingId, code, ip: "1.1.1.1" }, t0)).toEqual({
        ok: false,
        reason: "invalid_code",
      });
    }
  });

  it("过期的码无效", async () => {
    const expired = await newCode({ days: 1 });
    const later = plus(t0, 2 * 86400);
    const r = await resolveVerifiedIdentity(db, { email: "a@x.com", via: "email" }, later);
    if (r.kind !== "pending") throw new Error("期望 pending");
    expect(await redeemInvite(db, { pendingId: r.pendingId, code: expired.code, ip: "1.1.1.1" }, later)).toEqual({
      ok: false,
      reason: "invalid_code",
    });
  });

  it("待填状态超过 30 分钟失效", async () => {
    const code = await newCode();
    const pendingId = await pendingFor("a@x.com");
    expect(await redeemInvite(db, { pendingId, code: code.code, ip: "1.1.1.1" }, plus(t0, 31 * 60))).toEqual({
      ok: false,
      reason: "pending_expired",
    });
  });

  it("伪造的待填 id 无效", async () => {
    const code = await newCode();
    expect(
      (await redeemInvite(db, { pendingId: "not-a-uuid", code: code.code, ip: "1.1.1.1" }, t0)).ok,
    ).toBe(false);
  });

  it("同一 IP 每小时输错邀请码超过 10 次被限流", async () => {
    const pendingId = await pendingFor("a@x.com");
    for (let i = 0; i < 10; i++) {
      expect((await redeemInvite(db, { pendingId, code: `WRONG${i}`, ip: "5.5.5.5" }, plus(t0, i))).ok).toBe(false);
    }
    const code = await newCode();
    expect(await redeemInvite(db, { pendingId, code: code.code, ip: "5.5.5.5" }, plus(t0, 20))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("同一 IP 每天最多完成 3 次注册", async () => {
    const code = await newCode({ maxUses: 10 });
    for (let i = 0; i < 3; i++) {
      const pid = await pendingFor(`u${i}@x.com`);
      expect((await redeemInvite(db, { pendingId: pid, code: code.code, ip: "6.6.6.6" }, t0)).ok).toBe(true);
    }
    const pid = await pendingFor("u4@x.com");
    expect(await redeemInvite(db, { pendingId: pid, code: code.code, ip: "6.6.6.6" }, t0)).toEqual({
      ok: false,
      reason: "ip_signup_limit",
    });
  });

  it("ADMIN_EMAILS 中的邮箱注册后为管理员", async () => {
    process.env.ADMIN_EMAILS = "boss@x.com, other@x.com";
    const code = await newCode();
    const pid = await pendingFor("Boss@X.com");
    const r = await redeemInvite(db, { pendingId: pid, code: code.code, ip: "1.1.1.1" }, t0);
    expect(r.ok && r.user.role).toBe("admin");
  });
});

describe("Google 与邮箱账号关联（技术方案 5.1）", () => {
  it("先用验证码注册，后用 Google 登录时自动关联", async () => {
    const code = await newCode();
    const pid = await pendingFor("a@x.com");
    await redeemInvite(db, { pendingId: pid, code: code.code, ip: "1.1.1.1" }, t0);

    const r = await resolveVerifiedIdentity(db, { email: "a@x.com", via: "google", googleSub: "g-123", displayName: "阿明" }, t0);
    expect(r.kind).toBe("user");
    if (r.kind === "user") {
      expect(r.user.googleSub).toBe("g-123");
      expect(r.user.displayName).toBe("阿明");
    }
  });

  it("Google 注册的账号，换邮箱验证码登录也能进", async () => {
    const code = await newCode();
    const pid = await pendingFor("g@x.com", "google", "g-9");
    await redeemInvite(db, { pendingId: pid, code: code.code, ip: "1.1.1.1" }, t0);
    expect((await resolveVerifiedIdentity(db, { email: "g@x.com", via: "email" }, t0)).kind).toBe("user");
    expect((await resolveVerifiedIdentity(db, { email: "g@x.com", via: "google", googleSub: "g-9" }, t0)).kind).toBe("user");
  });

  it("停用账号不能登录", async () => {
    const code = await newCode();
    const pid = await pendingFor("bad@x.com");
    await redeemInvite(db, { pendingId: pid, code: code.code, ip: "1.1.1.1" }, t0);
    await db.update(users).set({ status: "disabled" }).where(eq(users.email, "bad@x.com"));
    expect((await resolveVerifiedIdentity(db, { email: "bad@x.com", via: "email" }, t0)).kind).toBe("disabled");
  });
});

describe("会话", () => {
  it("30 天内有效，过期后失效", async () => {
    const code = await newCode();
    const pid = await pendingFor("a@x.com");
    const r = await redeemInvite(db, { pendingId: pid, code: code.code, ip: "1.1.1.1" }, t0);
    if (!r.ok) throw new Error("注册失败");
    const { token } = await createSession(db, r.user.id, "test", t0);
    expect((await userForSession(db, token, plus(t0, 29 * 86400)))?.email).toBe("a@x.com");
    expect(await userForSession(db, token, plus(t0, 31 * 86400))).toBeNull();
    expect(await userForSession(db, "forged", t0)).toBeNull();
  });
});

describe("邀请码申请（F33b）", () => {
  it("重复申请只保留一条，发码后状态变为已发码", async () => {
    await applyForInvite(db, { email: "Wait@X.com", message: "想学做菜" });
    await applyForInvite(db, { email: "wait@x.com", message: "补充一句" });
    const list = await listWaitlist(db);
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe("补充一句");

    const result = await inviteFromWaitlist(db, list[0].id, "00000000-0000-0000-0000-000000000000", t0);
    expect(result?.email).toBe("wait@x.com");
    expect(result?.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect((await listWaitlist(db))[0].status).toBe("invited");
    // 不会重复发
    expect(await inviteFromWaitlist(db, list[0].id, "00000000-0000-0000-0000-000000000000", t0)).toBeNull();
  });
});

describe("发验证码前预查邀请码（登录页同页填写）", () => {
  it("有效码通过，大小写和空格不影响；无效、过期、用完、撤销都拒绝", async () => {
    const ok = await newCode();
    expect(await checkInviteCode(db, { code: ` ${ok.code.toLowerCase()} `, ip: "1.1.1.1" }, t0)).toEqual({ ok: true });
    expect(await checkInviteCode(db, { code: "NOPE1234", ip: "1.1.1.1" }, t0)).toEqual({ ok: false, reason: "invalid_code" });

    const expired = await newCode({ days: 1 });
    expect(await checkInviteCode(db, { code: expired.code, ip: "1.1.1.2" }, plus(t0, 2 * 86400))).toEqual({
      ok: false,
      reason: "invalid_code",
    });

    const revoked = await newCode();
    await revokeInviteCode(db, revoked.id, t0);
    expect(await checkInviteCode(db, { code: revoked.code, ip: "1.1.1.2" }, t0)).toMatchObject({ ok: false });

    const once = await newCode();
    const r = await redeemInvite(db, { pendingId: await pendingFor("a@x.com"), code: once.code, ip: "1.1.1.3" }, t0);
    expect(r.ok).toBe(true);
    expect(await checkInviteCode(db, { code: once.code, ip: "1.1.1.3" }, t0)).toMatchObject({ ok: false });
  });

  it("预查不占用邀请码，之后照常兑换", async () => {
    const c = await newCode();
    expect((await checkInviteCode(db, { code: c.code, ip: "2.2.2.2" }, t0)).ok).toBe(true);
    const r = await redeemInvite(db, { pendingId: await pendingFor("b@x.com"), code: c.code, ip: "2.2.2.2" }, t0);
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, c.id));
    expect(row.usedCount).toBe(1);
  });

  it("与兑换共用按 IP 的尝试次数，防止猜码", async () => {
    for (let i = 0; i < 10; i++) await checkInviteCode(db, { code: `GUESS${i}XX`, ip: "3.3.3.3" }, t0);
    const c = await newCode();
    expect(await checkInviteCode(db, { code: c.code, ip: "3.3.3.3" }, t0)).toEqual({ ok: false, reason: "rate_limited" });
    const r = await redeemInvite(db, { pendingId: await pendingFor("c@x.com"), code: c.code, ip: "3.3.3.3" }, t0);
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    // 其他 IP 不受影响
    expect((await checkInviteCode(db, { code: c.code, ip: "4.4.4.4" }, t0)).ok).toBe(true);
  });
});
