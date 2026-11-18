import type { Metadata } from "next";
import { SavedView, type SavedEntry } from "@/components/saved/saved-view";
import { ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { touchVisit } from "@/server/events";
import { listFavorites, listHistory, type SavedItem } from "@/server/saved";
import { cuisineMeta } from "../t/cuisine-meta";

export const metadata: Metadata = { title: "收藏" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string }> };

const toEntry = (i: SavedItem): SavedEntry => ({
  tutorialId: i.tutorialId,
  nameZh: i.nameZh,
  thumbUrl: i.thumbUrl,
  cuisine: cuisineMeta(i.cuisineId),
  cookedAt: i.cookedAt,
  at: i.at,
});

export default async function SavedPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <h1 className="font-serif text-display font-black">收藏</h1>
        <Card className="mt-4 p-4">
          <p>登录后，收藏的教程和看过的菜会出现在这里，收藏的教程没网也能看、能做。</p>
          <ButtonLink href="/login?next=/saved" className="mt-4">
            登录 / 注册
          </ButtonLink>
        </Card>
      </>
    );
  }
  const db = await getDb();
  const [favorites, history] = await Promise.all([
    listFavorites(db, user.id),
    listHistory(db, user.id),
    touchVisit(db, user.id),
  ]);
  const { tab } = await searchParams;
  return (
    <SavedView
      favorites={favorites.map(toEntry)}
      history={history?.map(toEntry) ?? null}
      initialTab={tab === "history" ? "history" : "favorites"}
    />
  );
}
