import type { Metadata } from "next";
import Link from "next/link";
import wokImage from "@/assets/wok.webp";
import { ChevronRight } from "lucide-react";
import { Card, SectionTitle, cuisineColor, stampColor } from "@/components/ui";
import { cuisinesByGroup, getCuisine, moreFlavors, primaryFlavors, type Flavor } from "@/lib/kb";
import { publicSamples } from "@/server/samples";

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
      <h1 className="font-serif text-display font-black">探索</h1>
      <p className="mt-1 text-text-muted">14 个菜系，一口锅里尝遍。点开看它们的味道从哪来、海外怎么买。</p>

      <Link href="/" className="mt-5 block overflow-hidden rounded-card bg-[#2b1e16] text-[#fff8ee]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 静态配图，已压成 WebP */}
        <img src={wokImage.src} alt="" width={960} height={640} className="h-[160px] w-full object-cover lg:h-[200px]" />
        <div className="px-[18px] pb-[18px] pt-4">
          <h2 className="font-serif text-[21px] font-black leading-[30px]">按你冰箱里的东西，现做一份</h2>
          <p className="mt-1.5 text-small text-[#e3d3be]">拍一下食材，挑个口味，从几个菜系里挑 3–5 道给你。</p>
          <span className="mt-3.5 inline-flex h-12 items-center gap-1 rounded-control bg-[#ff8a4c] px-5 font-bold text-[#1a1209]">
            去做菜 <ChevronRight size={18} aria-hidden />
          </span>
        </div>
      </Link>

      {publicSamples().length > 0 && (
        <section aria-labelledby="samples-title">
          <SectionTitle sub="不用登录，可以进烹饪模式">
            <span id="samples-title">示例教程</span>
          </SectionTitle>
          <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {publicSamples().map((s) => (
              <li key={s.slug} className="w-[150px] shrink-0">
                <Link href={`/samples/${s.slug}`} className="block h-full">
                  <Card className="h-full p-3 active:bg-surface-muted">
                    <p className="text-caption text-text-muted">{getCuisine(s.cuisine_id)?.name.zh}</p>
                    <p className="mt-0.5 font-bold">{s.content.overview.name_zh}</p>
                    <p className="mt-1 text-caption text-text-muted">
                      {s.content.overview.total_minutes} 分钟 · {s.content.steps.length} 步
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map(({ group, label, cuisines }) => (
        <section key={group} aria-labelledby={`g-${group}`}>
          <SectionTitle sub={`${cuisines.length} 个`}>
            <span id={`g-${group}`} className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: cuisineColor(group, 0) }} aria-hidden />
              {label}
            </span>
          </SectionTitle>
          <ul className="grid grid-cols-2 gap-2.5">
            {cuisines.map((c, i) => (
              <li key={c.id}>
                <Link href={`/explore/${c.id}`} className="block">
                  <Card className="h-full overflow-hidden rounded-[16px] active:bg-surface-muted">
                    <div
                      className="flex h-[58px] items-center px-3 font-brush text-[34px] leading-none text-[#fff8ee]"
                      style={{ background: stampColor(cuisineColor(group, i)) }}
                      aria-hidden
                    >
                      {c.id === "levant-turkish" ? "中东" : c.name.zh.replace(/(料理|家常菜|菜)$/, "").slice(0, 3)}
                    </div>
                    <div className="px-3 pb-3 pt-2.5">
                      <p className="font-bold">{c.name.zh}</p>
                      <p className="truncate text-caption text-text-muted">{c.name.en}</p>
                      <p className="mt-1.5 line-clamp-2 text-small">{c.overview}</p>
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
