// 读取已生成的教程（只能读自己的）及其追问、图片。
import { and, asc, eq } from "drizzle-orm";
import type { TutorialContent } from "@/lib/tutorial-types";
import type { Db } from "../db/client";
import { dishes, followups, tutorials } from "../db/schema";
import { isFavorite } from "../saved";
import { imageUrl } from "../dishes";

export interface TutorialView {
  id: string;
  status: "streaming" | "done" | "failed";
  content: TutorialContent | null;
  servings: number;
  units: "metric" | "us";
  dish: { id: string; nameZh: string; cuisineId: string; imageUrl: string | null; imageStatus: string };
  followups: { id: string; question: string; answer: string | null }[];
  favorite: boolean;
  cookedAt: string | null;
  createdAt: string;
}

export async function readTutorial(db: Db, userId: string, id: string): Promise<TutorialView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ t: tutorials, d: dishes })
    .from(tutorials)
    .innerJoin(dishes, eq(dishes.id, tutorials.dishId))
    .where(and(eq(tutorials.id, id), eq(tutorials.userId, userId)));
  if (!row) return null;
  const qs = await db
    .select({ id: followups.id, question: followups.question, answer: followups.answer })
    .from(followups)
    .where(eq(followups.tutorialId, id))
    .orderBy(asc(followups.createdAt));
  const params = row.t.params as { servings?: number; units?: "metric" | "us" };
  return {
    id: row.t.id,
    status: row.t.status,
    content: (row.t.content as TutorialContent | null) ?? null,
    servings: params.servings ?? 2,
    units: params.units ?? "metric",
    dish: {
      id: row.d.id,
      nameZh: row.d.nameZh,
      cuisineId: row.d.cuisineId,
      imageUrl: row.d.imageStatus === "ready" ? imageUrl(row.d.imageKey, 768) : null,
      imageStatus: row.d.imageStatus,
    },
    followups: qs.filter((q) => q.answer !== null),
    favorite: await isFavorite(db, userId, id),
    cookedAt: row.t.cookedAt?.toISOString() ?? null,
    createdAt: row.t.createdAt.toISOString(),
  };
}
