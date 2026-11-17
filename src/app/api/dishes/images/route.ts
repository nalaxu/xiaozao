import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { dishImages } from "@/server/dishes";

export const dynamic = "force-dynamic";

/** 前端轮询：这些菜的图生成好了没有（技术方案 8.3）。菜名与图片不含个人信息，不需登录 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 10);
  const size = req.nextUrl.searchParams.get("size") === "768" ? 768 : 384;
  return NextResponse.json({ images: await dishImages(await getDb(), ids, size) });
}
