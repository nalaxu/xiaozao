import { NextResponse, type NextRequest } from "next/server";
import { safeEqualHex, sha256 } from "@/server/crypto";
import { tick } from "@/server/cron";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 只接受带 Authorization: Bearer $CRON_SECRET 的请求（服务器 crontab 每分钟调用，见 deploy/） */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqualHex(sha256(auth), sha256(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await tick(await getDb()));
}
