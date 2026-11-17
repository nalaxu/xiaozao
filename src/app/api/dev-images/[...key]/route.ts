import { readDevImage } from "@/server/images/storage";

/** 仅本地开发：读取写在 .data/images 的菜品图片。线上图片由 R2 提供 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const buf = await readDevImage((await params).key.join("/"));
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" },
  });
}
