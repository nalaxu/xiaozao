import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CookMode } from "@/components/cook/cook-mode";
import { getCurrentUser } from "@/server/auth/current";
import { findSample } from "@/server/samples";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "烹饪模式（示例）" };

type Props = { params: Promise<{ slug: string }> };

export default async function SampleCookPage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const sample = findSample(slug, user?.role === "admin");
  if (!sample) notFound();
  return (
    <CookMode
      tutorialId={`sample-${sample.slug}`}
      content={sample.content}
      units="metric"
      exitHref={`/samples/${sample.slug}`}
      sample
    />
  );
}
