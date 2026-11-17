import type { Metadata } from "next";
import { RecommendView } from "@/components/recommend-view";
import { CUISINE_GROUP_LABELS, kb } from "@/lib/kb";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { quotaStatus } from "@/server/usage";
import { cuisineColor } from "@/components/ui";

export const metadata: Metadata = { title: "推荐" };
export const dynamic = "force-dynamic";

function cuisineMeta() {
  const groups = Object.keys(CUISINE_GROUP_LABELS) as (keyof typeof CUISINE_GROUP_LABELS)[];
  return Object.fromEntries(
    kb.cuisines.map((c) => {
      const inGroup = kb.cuisines.filter((x) => x.group === c.group);
      return [c.id, { zh: c.name.zh, color: cuisineColor(c.group, inGroup.indexOf(c)), group: groups.indexOf(c.group) }];
    }),
  );
}

export default async function RecommendPage() {
  // 未登录时登录后回到这里并自动开始推荐（技术方案 6.3）
  const user = await requireUser("/recommend?resume=1");
  const quota = await quotaStatus(await getDb(), user);
  return (
    <RecommendView
      quota={quota}
      cuisines={cuisineMeta()}
      flavors={Object.fromEntries(kb.flavors.map((f) => [f.id, f.zh]))}
      scenes={Object.fromEntries(kb.scenes.map((s) => [s.id, s.zh]))}
    />
  );
}
