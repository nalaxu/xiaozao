"use client";

// 生成中的教程：/t/new 发起生成并流式显示；/t/[id] 遇到仍在生成的教程时轮询等待。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/form";
import { resetTimeLabel } from "@/lib/draft";
import { parsePartialJson } from "@/lib/partial-json";
import type { TutorialContent, TutorialEvent } from "@/lib/tutorial-types";
import type { UnitSystem } from "@/lib/units";
import { useDishImages } from "@/lib/use-dish-images";
import { TutorialView, type PartialContent } from "./tutorial-view";

type Mode = { kind: "generate"; runId: string; dishId: string } | { kind: "poll"; id: string };

interface Props {
  mode: Mode;
  dish: { id: string; nameZh: string; imageUrl: string | null };
  cuisine: { zh: string; color: string } | undefined;
  units: UnitSystem;
  followupLimit: number;
  backHref: string;
}

type ErrorState = { code: string; message: string; resetAt?: string };

export function TutorialLive(props: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(props.mode.kind === "poll" ? props.mode.id : null);
  const [content, setContent] = useState<PartialContent | null>(null);
  const [streaming, setStreaming] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);
  const imageFor = useDishImages([{ dishId: props.dish.id, imageUrl: props.dish.imageUrl }], 768);

  useEffect(() => {
    const mode = props.mode;

    if (mode.kind === "poll") {
      let cancelled = false;
      const poll = async () => {
        if (cancelled) return;
        const res = await fetch(`/api/tutorials/${mode.id}`).catch(() => null);
        const t = res?.ok ? ((await res.json()) as { status: string; content: TutorialContent | null }) : null;
        if (t?.status === "done") {
          router.refresh();
          return;
        }
        if (t?.status === "failed") {
          setStreaming(false);
          setError({ code: "model", message: "这份教程没生成出来，次数已退回。回到推荐页再选一次？" });
          return;
        }
        setTimeout(poll, 2000);
      };
      setStatus("还在生成，马上就好…");
      void poll();
      return () => {
        cancelled = true;
      };
    }

    // 生成会扣额度，每次尝试只发一次请求
    if (started.current === attempt) return;
    started.current = attempt;

    (async () => {
      setStreaming(true);
      setError(null);
      setContent(null);
      setStatus("正在写菜谱…");
      let text = "";
      try {
        const res = await fetch("/api/tutorials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: mode.runId, dishId: mode.dishId }),
        });
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("ndjson")) {
          const data = (await res.json().catch(() => ({}))) as { existing?: string; error?: string; code?: string };
          if (data.existing) {
            router.replace(`/t/${data.existing}`);
            return;
          }
          if (res.status === 401) {
            router.push(`/login?next=${encodeURIComponent(`/t/new?run=${mode.runId}&dish=${mode.dishId}`)}`);
            return;
          }
          setStreaming(false);
          setError({ code: data.code ?? "model", message: data.error ?? "这次没生成出来，请稍后再试" });
          return;
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let frame: ReturnType<typeof setTimeout> | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          buf += value ? decoder.decode(value, { stream: true }) : "";
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            // 生成请求只发一次（见 started），不随 effect 清理而丢弃，否则开发模式的二次执行会吞掉结果
            if (!line) continue;
            const e = JSON.parse(line) as TutorialEvent;
            if (e.type === "start") {
              setId(e.id);
              // 地址换成教程自己的，刷新或分享都不会重新生成
              window.history.replaceState(null, "", `/t/${e.id}`);
            } else if (e.type === "delta") {
              text += e.text;
              // 最多每 80 毫秒解析一次（不用 requestAnimationFrame：后台标签页里它会暂停）
              if (!frame) {
                frame = setTimeout(() => {
                  frame = null;
                  const parsed = parsePartialJson<PartialContent>(text);
                  if (parsed) {
                    setContent(parsed);
                    setStatus(parsed.steps?.length ? "正在写步骤…" : "正在列食材…");
                  }
                }, 80);
              }
            } else if (e.type === "reset") {
              if (frame) clearTimeout(frame);
              frame = null;
              text = "";
              setContent(null);
              setStatus(e.reason);
            } else if (e.type === "done") {
              if (frame) clearTimeout(frame);
              setContent(e.content);
              setStreaming(false);
              setStatus(null);
            } else if (e.type === "error") {
              if (frame) clearTimeout(frame);
              setStreaming(false);
              setError({ code: e.code, message: e.error, resetAt: e.resetAt });
            }
          }
          if (done) break;
        }
      } catch {
        setStreaming(false);
        setError({ code: "network", message: "网络中断了。教程可能还在生成，稍后在这里刷新看看。" });
      }
    })();
  }, [attempt, props.mode, router]);

  if (error) {
    const message =
      error.code === "quota"
        ? `今天的教程次数用完了，${resetTimeLabel(error.resetAt ?? new Date().toISOString())}（你的时间）恢复。`
        : error.code === "budget_paused"
          ? "今天的生成名额已满，明天再来。次数已退回。"
          : error.message;
    const canRetry = props.mode.kind === "generate" && !["quota", "budget_paused", "invalid"].includes(error.code);
    return (
      <div className="pt-4">
        <Link href={props.backHref} className="text-text-muted">
          ← 回到推荐
        </Link>
        <h1 className="mt-4 font-serif text-display font-black">{props.dish.nameZh}</h1>
        <div role="alert" className="mt-4 rounded-card bg-surface-muted p-4">
          <p>{message}</p>
          {canRetry && (
            <Button variant="secondary" className="mt-3" onClick={() => setAttempt((a) => a + 1)}>
              再试一次
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <TutorialView
      tutorialId={streaming ? null : id}
      content={content}
      streaming={streaming}
      status={status}
      dish={{ ...props.dish, imageUrl: imageFor(props.dish.id, props.dish.imageUrl) }}
      cuisine={props.cuisine}
      units={props.units}
      followups={[]}
      favorite={streaming || !id ? undefined : false}
      followupLimit={props.followupLimit}
      backHref={props.backHref}
    />
  );
}
