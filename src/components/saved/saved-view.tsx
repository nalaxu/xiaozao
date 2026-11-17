"use client";

// 收藏与历史（设计文档 4.8）。收藏的教程会下载到本机，离线可看可做。
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownToLine, CheckCircle2 } from "lucide-react";
import { DishImage } from "@/components/dish-image";
import { ButtonLink, Card } from "@/components/ui";
import { groupByDay } from "@/lib/day-groups";
import { fetchOfflineRecord, listOffline, syncFavorites } from "@/lib/offline";

export interface SavedEntry {
  tutorialId: string;
  nameZh: string;
  thumbUrl: string | null;
  cuisine?: { zh: string; color: string };
  cookedAt: string | null;
  at: string;
}

type Tab = "favorites" | "history";

export function SavedView({
  favorites,
  history,
  initialTab,
}: {
  favorites: SavedEntry[];
  history: SavedEntry[] | null;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const list = await listOffline();
      if (alive) setOfflineIds(new Set(list.map((t) => t.id)));
    };
    void refresh();
    // 收藏的教程下载到本机（已经有的跳过）
    void syncFavorites(
      favorites.map((f) => f.tutorialId),
      fetchOfflineRecord,
    ).then(refresh);
    return () => {
      alive = false;
    };
  }, [favorites]);

  const switchTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "history" ? "/saved?tab=history" : "/saved");
  };

  return (
    <>
      <h1 className="text-h1 font-bold">收藏</h1>
      <div className="mt-4 grid grid-cols-2 rounded-full bg-surface-muted p-1" role="tablist" aria-label="收藏与历史">
        {(
          [
            ["favorites", "收藏"],
            ["history", "历史"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => switchTab(id)}
            className={`h-10 rounded-full text-small ${tab === id ? "bg-surface font-bold shadow-sm" : "text-text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "favorites" ? (
        favorites.length ? (
          <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-surface">
            {favorites.map((f) => (
              <SavedRow key={f.tutorialId} entry={f} from="saved" offline={offlineIds.has(f.tutorialId)} />
            ))}
          </ul>
        ) : (
          <Card className="mt-4 p-4">
            <p>还没有收藏。</p>
            <p className="mt-1 text-small text-text-muted">在教程页点右上角的书签收藏，收藏的教程没网也能看、能做。</p>
            <ButtonLink href="/" variant="secondary" className="mt-4">
              去做菜
            </ButtonLink>
          </Card>
        )
      ) : history === null ? (
        <Card className="mt-4 p-4">
          <p>历史记录已关闭。</p>
          <p className="mt-1 text-small text-text-muted">生成过的教程不会出现在这里，也不会用来避免重复推荐。收藏不受影响。</p>
        </Card>
      ) : history.length ? (
        <div className="mt-2">
          {groupByDay(history, (h) => h.at).map((g) => (
            <section key={g.label} className="mt-4">
              <h2 className="mb-2 text-small text-text-muted">{g.label}</h2>
              <ul className="divide-y divide-border rounded-card border border-border bg-surface">
                {g.items.map((h) => (
                  <SavedRow key={h.tutorialId} entry={h} from="history" offline={offlineIds.has(h.tutorialId)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <Card className="mt-4 p-4">
          <p>还没有看过的教程。</p>
          <p className="mt-1 text-small text-text-muted">从推荐里点开一道菜，它就会出现在这里。</p>
          <ButtonLink href="/" variant="secondary" className="mt-4">
            去做菜
          </ButtonLink>
        </Card>
      )}
    </>
  );
}

export function SavedRow({
  entry,
  from,
  offline,
  plainLink = false,
}: {
  entry: SavedEntry;
  from: "saved" | "history";
  offline: boolean;
  /** 离线外壳里用普通链接（整页跳转由 Service Worker 接管） */
  plainLink?: boolean;
}) {
  const href = `/t/${entry.tutorialId}?from=${from}`;
  const body = (
    <>
      <DishImage
        url={entry.thumbUrl}
        color={entry.cuisine?.color}
        label=""
        caption=""
        className="h-16 w-16 shrink-0 rounded-control"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{entry.nameZh}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-text-muted">
          {entry.cuisine && <span>{entry.cuisine.zh}</span>}
          {entry.cookedAt && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 size={14} aria-hidden /> 做过
            </span>
          )}
          {offline && (
            <span className="inline-flex items-center gap-1 text-success">
              <ArrowDownToLine size={14} aria-hidden /> 可离线
            </span>
          )}
        </p>
      </div>
    </>
  );
  const cls = "flex items-center gap-3 p-3 active:bg-surface-muted";
  return (
    <li>
      {plainLink ? (
        <a href={href} className={cls}>
          {body}
        </a>
      ) : (
        <Link href={href} className={cls}>
          {body}
        </Link>
      )}
    </li>
  );
}
