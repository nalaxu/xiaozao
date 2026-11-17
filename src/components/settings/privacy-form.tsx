"use client";

// 数据与隐私（设计文档 4.10；PRD 7.1、F30）
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, TextInput } from "@/components/form";
import { Sheet } from "@/components/overlay";
import { Card } from "@/components/ui";
import { clearOffline } from "@/lib/offline";
import { PRIVACY_KEYS, PRIVACY_LABELS, type PrivacyKey } from "@/lib/preference-options";
import { Section, Switch } from "./controls";

type Dialog = { kind: "off"; key: PrivacyKey } | { kind: "wipe" } | { kind: "account" } | null;

export function PrivacyForm({ initial }: { initial: Record<PrivacyKey, boolean> }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const setSwitch = async (key: PrivacyKey, on: boolean, purge = false) => {
    setBusy(true);
    setError(null);
    const before = state[key];
    setState((s) => ({ ...s, [key]: on }));
    const res = await fetch("/api/me/privacy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, on, purge }),
    }).catch(() => null);
    setBusy(false);
    setDialog(null);
    if (!res?.ok) {
      setState((s) => ({ ...s, [key]: before }));
      setError("没保存上，请检查网络后再试");
      return;
    }
    if (purge) setNotice(`已删除记录的${PRIVACY_LABELS[key].title}`);
    router.refresh();
  };

  const wipe = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/data", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("没删除成功，请稍后再试");
    await clearOffline();
    setDialog(null);
    setState(Object.fromEntries(PRIVACY_KEYS.map((k) => [k, true])) as Record<PrivacyKey, boolean>);
    setNotice("已删除全部数据。账号还在，可以继续使用。");
    router.refresh();
  };

  const closeAccount = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: confirmText.trim() }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      return setError("没注销成功，请稍后再试");
    }
    await clearOffline();
    router.replace("/");
    router.refresh();
  };

  return (
    <>
      {notice && (
        <p role="status" className="mb-4 rounded-card bg-surface-muted p-3 text-small">
          {notice}
        </p>
      )}
      {error && !dialog && (
        <p role="alert" className="mb-4 text-small text-danger">
          {error}
        </p>
      )}

      <Section title="记录哪些数据" sub="关闭后不再记录，也不再用于推荐。忌口与过敏总是生效。">
        <Card>
          <ul className="divide-y divide-border">
            {PRIVACY_KEYS.map((k) => (
              <li key={k} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{PRIVACY_LABELS[k].title}</p>
                  <p className="text-small text-text-muted">{PRIVACY_LABELS[k].desc}</p>
                </div>
                <Switch
                  checked={state[k]}
                  label={PRIVACY_LABELS[k].title}
                  disabled={busy}
                  onChange={(on) => (on ? setSwitch(k, true) : setDialog({ kind: "off", key: k }))}
                />
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="导出与删除">
        <div className="space-y-3">
          <a
            href="/api/me/export"
            download
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-control border border-border bg-surface font-bold active:bg-surface-muted"
          >
            <Download size={18} aria-hidden /> 导出我的数据
          </a>
          <Button variant="secondary" onClick={() => setDialog({ kind: "wipe" })}>
            删除全部数据
          </Button>
          <Button variant="danger-ghost" onClick={() => setDialog({ kind: "account" })}>
            注销账号
          </Button>
        </div>
        <p className="mt-3 text-caption text-text-muted">
          导出为 JSON 文件，包含偏好、教程、收藏、评价和追问。食材照片从不保存。
        </p>
      </Section>

      {dialog?.kind === "off" && (
        <Sheet title={`关闭“${PRIVACY_LABELS[dialog.key].title}”记录`} onClose={() => setDialog(null)}>
          <p>要同时删除已记录的数据吗？</p>
          {dialog.key === "recordHistory" && (
            <p className="mt-1 text-small text-text-muted">会删除推荐记录和没有收藏的教程，收藏的教程保留。</p>
          )}
          <div className="mt-5 space-y-3">
            <Button onClick={() => setSwitch(dialog.key, false, true)} loading={busy} variant="danger">
              关闭并删除
            </Button>
            <Button variant="secondary" onClick={() => setSwitch(dialog.key, false, false)} disabled={busy}>
              只关闭，保留已有数据
            </Button>
          </div>
        </Sheet>
      )}

      {dialog?.kind === "wipe" && (
        <Sheet title="删除全部数据" onClose={() => setDialog(null)}>
          <p>会删除你的忌口与过敏、厨具、口味、全部教程（含收藏）、评价和追问，这台设备上保存的教程也会清掉。删除后无法恢复。</p>
          <p className="mt-2 text-small text-text-muted">账号保留。今天已用的次数不会恢复。</p>
          {error && <p className="mt-3 text-small text-danger">{error}</p>}
          <Button onClick={wipe} loading={busy} variant="danger" className="mt-5">
            确认删除
          </Button>
        </Sheet>
      )}

      {dialog?.kind === "account" && (
        <Sheet title="注销账号" onClose={() => setDialog(null)}>
          <p>账号和全部数据都会删除，无法恢复。以后想再用需要新的邀请码。</p>
          <label className="mt-4 block text-small">
            请输入“注销”确认
            <TextInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1"
              autoComplete="off"
            />
          </label>
          {error && <p className="mt-3 text-small text-danger">{error}</p>}
          <Button onClick={closeAccount} loading={busy} disabled={confirmText.trim() !== "注销"} variant="danger" className="mt-5">
            注销账号
          </Button>
        </Sheet>
      )}
    </>
  );
}
