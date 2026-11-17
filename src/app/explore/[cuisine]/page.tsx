import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  ButtonLink,
  Card,
  Chip,
  CuisinePlaceholder,
  DifficultyDots,
  SectionTitle,
  cuisineColor,
} from "@/components/ui";
import { CUISINE_GROUP_LABELS, getCuisine, getFlavor, getScene, kb } from "@/lib/kb";

export function generateStaticParams() {
  return kb.cuisines.map((c) => ({ cuisine: c.id }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ cuisine: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = getCuisine((await params).cuisine);
  return c ? { title: c.name.zh, description: c.overview } : {};
}

export default async function CuisinePage({ params }: Props) {
  const cuisine = getCuisine((await params).cuisine);
  if (!cuisine) notFound();

  const indexInGroup = kb.cuisines.filter((c) => c.group === cuisine.group).indexOf(cuisine);

  return (
    <article>
      <Link
        href="/explore"
        className="-ml-2 mb-2 inline-flex h-11 items-center gap-1 px-2 text-small text-text-muted"
      >
        <ChevronLeft size={18} aria-hidden />
        探索
      </Link>

      <Card className="overflow-hidden">
        <CuisinePlaceholder
          color={cuisineColor(cuisine.group, indexInGroup)}
          label={cuisine.name.zh}
          className="h-28 text-display"
        />
        <div className="p-4">
          <p className="text-small text-text-muted">
            {CUISINE_GROUP_LABELS[cuisine.group]} · {cuisine.name.en}
          </p>
          <h1 className="mt-1 text-display font-bold">{cuisine.name.zh}</h1>
          <p className="mt-3">{cuisine.overview}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {cuisine.flavor_tags.map((t) => (
              <Chip key={t} selected>
                {getFlavor(t)?.zh ?? t}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      <SectionTitle>典型味型</SectionTitle>
      <Card className="px-4">
        <dl className="divide-y divide-border">
          {cuisine.flavor_profiles.map((p) => (
            <div key={p.name} className="py-3">
              <dt className="font-bold">{p.name}</dt>
              <dd className="text-text-muted">{p.how}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <SectionTitle>核心调料</SectionTitle>
      <Card className="px-4">
        <ul className="divide-y divide-border">
          {cuisine.core_seasonings.map((s) => (
            <li key={s.zh} className="py-3">
              <p>
                <span className="font-bold">{s.zh}</span>
                <span className="ml-2 text-small text-text-muted">{s.en}</span>
              </p>
              <p className="text-small text-text-muted">{s.role}</p>
            </li>
          ))}
        </ul>
      </Card>

      <SectionTitle>代表技法</SectionTitle>
      <Card className="px-4">
        <dl className="divide-y divide-border">
          {cuisine.techniques.map((t) => (
            <div key={t.name} className="py-3">
              <dt className="font-bold">{t.name}</dt>
              <dd className="text-text-muted">{t.key_points}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <SectionTitle sub={`${cuisine.representative_dishes.length} 道`}>代表菜</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cuisine.representative_dishes.map((d) => (
          <li key={d.zh}>
            <Card className="h-full p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{d.zh}</p>
                  <p className="text-small text-text-muted">{d.original ?? d.en}</p>
                </div>
                <DifficultyDots level={d.difficulty} />
              </div>
              <p className="mt-2 text-small">{d.key}</p>
              <p className="mt-2 text-caption text-text-muted">
                {[...d.flavors.map((f) => getFlavor(f)?.zh), ...d.scenes.map((s) => getScene(s)?.zh)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Card>
          </li>
        ))}
      </ul>

      <SectionTitle>在海外怎么买</SectionTitle>
      <Card className="px-4">
        <ul className="divide-y divide-border">
          {cuisine.overseas.map((o) => (
            <li key={o.item} className="py-3">
              <p className="font-bold">{o.item}</p>
              <p className="text-small">
                <span className="text-text-muted">哪里买：</span>
                {o.where}
              </p>
              <p className="text-small">
                <span className="text-text-muted">买不到：</span>
                {o.substitute}
              </p>
              <p className="text-small">
                <span className="text-text-muted">差别：</span>
                {o.difference}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-8">
        <ButtonLink href={`/?cuisine=${cuisine.id}`}>用这个菜系推荐</ButtonLink>
      </div>
    </article>
  );
}
