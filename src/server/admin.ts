// 管理后台的数据操作：邀请码与申请（F37、F33b）。
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { inviteCodes, inviteRedemptions, users, waitlist } from "./db/schema";
import { inviteCode } from "./crypto";

export async function createInviteCodes(
  db: Db,
  input: { count: number; maxUses: number; expiresInDays: number | null; note: string | null; createdBy: string | null },
  now = new Date(),
) {
  const count = Math.min(Math.max(1, Math.floor(input.count)), 50);
  const rows = Array.from({ length: count }, () => ({
    code: inviteCode(),
    maxUses: Math.min(Math.max(1, Math.floor(input.maxUses)), 1000),
    expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * 86400_000) : null,
    note: input.note?.trim().slice(0, 100) || null,
    createdBy: input.createdBy,
  }));
  return db.insert(inviteCodes).values(rows).onConflictDoNothing().returning();
}

export async function listInviteCodes(db: Db) {
  const codes = await db.select().from(inviteCodes).orderBy(desc(inviteCodes.createdAt)).limit(200);
  if (codes.length === 0) return [];
  const used = await db
    .select({ inviteCodeId: inviteRedemptions.inviteCodeId, email: users.email })
    .from(inviteRedemptions)
    .innerJoin(users, eq(users.id, inviteRedemptions.userId))
    .where(
      inArray(
        inviteRedemptions.inviteCodeId,
        codes.map((c) => c.id),
      ),
    );
  return codes.map((c) => ({ ...c, usedBy: used.filter((u) => u.inviteCodeId === c.id).map((u) => u.email) }));
}

export async function revokeInviteCode(db: Db, id: string, now = new Date()) {
  await db
    .update(inviteCodes)
    .set({ revokedAt: now })
    .where(and(eq(inviteCodes.id, id), isNull(inviteCodes.revokedAt)));
}

export async function listWaitlist(db: Db) {
  return db
    .select()
    .from(waitlist)
    .orderBy(sql`case when ${waitlist.status} = 'pending' then 0 else 1 end`, desc(waitlist.createdAt))
    .limit(200);
}

/** 给申请人发一个单次、14 天有效的邀请码；返回码与邮箱供调用方发邮件 */
export async function inviteFromWaitlist(db: Db, waitlistId: string, adminId: string, now = new Date()) {
  const [entry] = await db.select().from(waitlist).where(eq(waitlist.id, waitlistId)).limit(1);
  if (!entry || entry.status !== "pending") return null;
  const [code] = await createInviteCodes(
    db,
    { count: 1, maxUses: 1, expiresInDays: 14, note: `申请：${entry.email}`, createdBy: adminId },
    now,
  );
  await db.update(waitlist).set({ status: "invited", inviteCodeId: code.id }).where(eq(waitlist.id, waitlistId));
  return { email: entry.email, code: code.code };
}

export async function ignoreWaitlist(db: Db, waitlistId: string) {
  await db.update(waitlist).set({ status: "ignored" }).where(eq(waitlist.id, waitlistId));
}
