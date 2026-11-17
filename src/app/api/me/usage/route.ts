import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { quotaStatus } from "@/server/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json(await quotaStatus(await getDb(), user));
}
