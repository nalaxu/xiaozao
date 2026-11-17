import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CuisinePlaceholder, SectionTitle, cuisineColor } from "@/components/ui";
import { cuisinesByGroup, getCuisine, moreFlavors, primaryFlavors, type Flavor } from "@/lib/kb";

export const metadata: Metadata = { title: "探索菜系" };

function FlavorRow({ flavor }: { flavor: Flavor }) {
  const names = flavor.cuisines
    .map((id) => getCuisine(id)?.name.zh)
    .filter(Boolean)
    .join("、");
  return (
    <li className="flex gap-3 py-3">
      <span className="w-20 shrink-0 font-bold">{flavor.zh}</span>
      <div className="min-w-0">
        <p>{flavor.description}</p>
        <p className="text-small text-text-muted">擅长：{names}</p>
      </div>
    </li>
  );
}

export default function ExplorePage() {
  const groups = cuisinesByGroup();
  return (
    <>
      <h1 className="text-h1 font-bold">探索</h1>
      <p className="mt-1 text-text-muted">第一版收录 14 个菜系。点开看它们的味道从哪来、海外怎么买。</p>

      {groups.map(({ group, label, cuisines }) => (
        <section key={group} aria-labelledby={`g-${group}`}>
          <SectionTitle sub={`${cuisines.length} 个`}>
            <span id={`g-${group}`}>{label}</span>
          </SectionTitle>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cuisines.map((c, i) => (
              <li key={c.id}>
                <Link href={`/explore/${c.id}`} className="block">
                  <Card className="flex items-stretch overflow-hidden active:bg-surface-muted">
                    <CuisinePlaceholder
                      color={cuisineColor(group, i)}
                      label={c.name.zh.slice(0, 1)}
                      className="w-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{c.name.zh}</span>
                        <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
                      </div>
                      <p className="text-small text-text-muted">{c.name.en}</p>
                      <p className="mt-1 line-clamp-2 text-small">{c.overview}</p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <SectionTitle>味型</SectionTitle>
      <Card className="px-4">
        <ul className="divide-y divide-border">
          {primaryFlavors().map((f) => (
            <FlavorRow key={f.id} flavor={f} />
          ))}
        </ul>
      </Card>
      <h3 className="mb-2 mt-5 text-small font-bold text-text-muted">更多味型</h3>
      <Card className="px-4">
        <ul className="divide-y divide-border">
          {moreFlavors().map((f) => (
            <FlavorRow key={f.id} flavor={f} />
          ))}
        </ul>
      </Card>
    </>
  );
}
