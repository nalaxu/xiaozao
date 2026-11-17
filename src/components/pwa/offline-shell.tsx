"use client";

// 断网时的页面（技术方案第 11 节）：/t/[id] 与 /t/[id]/cook 从本机 IndexedDB 读出教程，其余地址列出本机可用的教程。
import { useEffect, useState } from "react";
import { CookMode } from "@/components/cook/cook-mode";
import { SavedRow, type SavedEntry } from "@/components/saved/saved-view";
import { TutorialView } from "@/components/tutorial/tutorial-view";
import { Card } from "@/components/ui";
import { getOffline, listOffline, thumbOf, type OfflineTutorial } from "@/lib/offline";

type State =
  | { kind: "loading" }
  | { kind: "tutorial"; t: OfflineTutorial; cook: boolean }
  | { kind: "missing" }
  | { kind: "list"; list: OfflineTutorial[] };

const toEntry = (t: OfflineTutorial): SavedEntry => ({
  tutorialId: t.id,
  nameZh: t.dish.nameZh,
  thumbUrl: thumbOf(t.dish.imageUrl),
  cuisine: t.cuisine,
  cookedAt: t.cookedAt,
  at: new Date(t.openedAt || Date.now()).toISOString(),
});

export function OfflineShell() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const m = window.location.pathname.match(/^\/t\/([0-9a-f-]{36})(\/cook)?\/?$/i);
    if (m) {
      void getOffline(m[1]).then((t) => setState(t ? { kind: "tutorial", t, cook: Boolean(m[2]) } : { kind: "missing" }));
    } else {
      void listOffline().then((list) => setState({ kind: "list", list }));
    }
  }, []);

  if (state.kind === "loading") return null;

  if (state.kind === "tutorial") {
    const { t } = state;
    if (state.cook) {
      return <CookMode tutorialId={t.id} content={t.content} units={t.units} exitHref={`/t/${t.id}`} />;
    }
    return (
      <TutorialView
        tutorialId={t.id}
        content={t.content}
        streaming={false}
        dish={{ id: t.dish.id, nameZh: t.dish.nameZh, imageUrl: t.dish.imageUrl }}
        cuisine={t.cuisine}
        units={t.units}
        followups={[]}
        followupLimit={0}
        backHref="/saved"
        cookedAt={t.cookedAt}
        offline
      />
    );
  }

  return <OfflineList missing={state.kind === "missing"} list={state.kind === "list" ? state.list : null} />;
}

function OfflineList({ missing, list: initial }: { missing: boolean; list: OfflineTutorial[] | null }) {
  const [list, setList] = useState(initial ?? []);
  useEffect(() => {
    if (!initial) void listOffline().then(setList);
  }, [initial]);
  const favorites = list.filter((t) => t.favorite);
  const recent = list.filter((t) => !t.favorite && t.openedAt > 0);

  return (
    <>
      <h1 className="text-h1 font-bold">现在没有网络</h1>
      <Card className="mt-4 p-4">
        <p>{missing ? "这份教程没有存到这台设备上。" : "联网后才能推荐和生成新教程。"}</p>
        <p className="mt-1 text-small text-text-muted">收藏的教程和最近打开的 5 份教程，没网也能看、能做。</p>
      </Card>
      {favorites.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-h2 font-bold">收藏</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {favorites.map((t) => (
              <SavedRow key={t.id} entry={toEntry(t)} from="saved" offline plainLink />
            ))}
          </ul>
        </section>
      )}
      {recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-h2 font-bold">最近打开</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {recent.map((t) => (
              <SavedRow key={t.id} entry={toEntry(t)} from="history" offline plainLink />
            ))}
          </ul>
        </section>
      )}
      {!list.length && <p className="mt-6 text-text-muted">这台设备上还没有保存的教程。</p>}
    </>
  );
}
