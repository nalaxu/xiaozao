import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { dishes, jobs } from "../db/schema";

/** 没有图的菜排进生成队列（技术方案 8.2）；已排队、生成中或已有图的返回 false */
export async function enqueueImage(db: Db, dishId: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .update(dishes)
    .set({ imageStatus: "queued" })
    .where(and(eq(dishes.id, dishId), eq(dishes.imageStatus, "none")))
    .returning({ id: dishes.id });
  if (!row) return false;
  await db.insert(jobs).values({ type: "image", payload: { dishId }, runAfter: now });
  return true;
}
