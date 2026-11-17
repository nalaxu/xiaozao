"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createInviteCodes, ignoreWaitlist, inviteFromWaitlist, revokeInviteCode } from "@/server/admin";
import { requireAdmin } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { inviteMail, sendMail } from "@/server/mail";

const createSchema = z.object({
  count: z.coerce.number().int().min(1).max(50),
  maxUses: z.coerce.number().int().min(1).max(1000),
  expiresInDays: z.coerce.number().int().min(0).max(365),
  note: z.string().max(100).optional(),
});

export async function createInvitesAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = createSchema.parse(Object.fromEntries(formData));
  await createInviteCodes(await getDb(), {
    count: input.count,
    maxUses: input.maxUses,
    expiresInDays: input.expiresInDays || null,
    note: input.note ?? null,
    createdBy: admin.id,
  });
  revalidatePath("/admin/invites");
}

export async function revokeInviteAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await revokeInviteCode(await getDb(), id);
  revalidatePath("/admin/invites");
}

export async function inviteApplicantAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const result = await inviteFromWaitlist(await getDb(), id, admin.id);
  if (result) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await sendMail(inviteMail(result.email, result.code, appUrl));
  }
  revalidatePath("/admin/waitlist");
  revalidatePath("/admin/invites");
}

export async function ignoreApplicantAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await ignoreWaitlist(await getDb(), id);
  revalidatePath("/admin/waitlist");
}
