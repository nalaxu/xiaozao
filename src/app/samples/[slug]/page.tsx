import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TutorialView } from "@/components/tutorial/tutorial-view";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { findDishImage } from "@/server/dishes";
import { findSample } from "@/server/samples";
import { cuisineMeta } from "../../t/cuisine-meta";

// 示例教程（设计文档 4.9）：未登录可看，与正式教程同样的页面
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = findSample((await params).slug, true);
  return s ? { title: `${s.content.overview.name_zh}（示例教程）`, description: s.content.overview.flavor_desc } : {};
}

export default async function SamplePage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const sample = findSample(slug, user?.role === "admin");
  if (!sample) notFound();
  const { content } = sample;
  const image = await findDishImage(await getDb(), sample.cuisine_id, content.overview.name_zh).catch(() => null);
  return (
    <TutorialView
      tutorialId={null}
      content={content}
      streaming={false}
      dish={{ id: image?.id ?? sample.slug, nameZh: content.overview.name_zh, imageUrl: image?.imageUrl ?? null }}
      cuisine={cuisineMeta(sample.cuisine_id)}
      units="metric"
      followups={[]}
      followupLimit={0}
      backHref={`/explore/${sample.cuisine_id}`}
      sample={{ cookHref: `/samples/${sample.slug}/cook`, draft: sample.status !== "reviewed" }}
    />
  );
}
