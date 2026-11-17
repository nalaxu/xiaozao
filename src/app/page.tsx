import Link from "next/link";
import { Camera, Search } from "lucide-react";
import { ButtonLink, Card, Chip, SectionTitle } from "@/components/ui";
import { kb, primaryFlavors } from "@/lib/kb";

// M0：首页先展示产品入口与知识库内容；食材 → 口味的完整流程在 M2 实现（技术方案第 17 节）。
export default function HomePage() {
  const dishCount = kb.cuisines.reduce((n, c) => n + c.representative_dishes.length, 0);

  return (
    <>
      <p className="text-h2 font-bold text-primary lg:hidden">小灶</p>
      <h1 className="mt-4 text-display font-bold">今天手头有什么？</h1>
      <p className="mt-2 text-text-muted">
        告诉它你想吃什么味道、手头有什么，它帮你挑几道菜，再带你做出来。
      </p>

      <div className="mt-6 space-y-3" aria-describedby="coming-soon">
        <Card className="flex h-14 items-center gap-3 px-4 text-text-muted">
          <Camera size={22} strokeWidth={1.75} aria-hidden />
          拍一下冰箱或台面
        </Card>
        <Card className="flex h-14 items-center gap-3 px-4 text-text-muted">
          <Search size={22} strokeWidth={1.75} aria-hidden />
          输入食材，中英文都行
        </Card>
        <p id="coming-soon" className="text-small text-text-muted">
          选食材和推荐功能即将开放。
        </p>
      </div>

      <SectionTitle sub={<Link href="/explore">全部味型</Link>}>想吃什么味道</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {primaryFlavors().map((f) => (
          <Chip key={f.id}>{f.zh}</Chip>
        ))}
      </div>

      <SectionTitle>先逛逛</SectionTitle>
      <Card className="p-4">
        <p>
          收录 {kb.cuisines.length} 个菜系、{dishCount} 道代表菜，每个菜系都写了核心调料、关键技法和海外替代。
        </p>
        <ButtonLink href="/explore" variant="secondary" className="mt-4">
          探索菜系
        </ButtonLink>
      </Card>
    </>
  );
}
