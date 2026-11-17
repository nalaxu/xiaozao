"use client";

import { useState } from "react";
import { Button, FieldError, postJson, TextInput } from "@/components/form";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";
import { ButtonLink, Card } from "@/components/ui";

export function ApplyForm({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await postJson("/api/auth/apply", { email, message, turnstileToken: token });
    setBusy(false);
    setResetKey((k) => k + 1);
    if (!res.ok) {
      setError(res.data.error ?? "提交失败，请稍后再试");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card className="p-4" role="status">
        <p className="font-bold">已收到申请</p>
        <p className="mt-1 text-text-muted">发放邀请码后会发邮件到 {email}。</p>
        <ButtonLink href="/explore" variant="secondary" className="mt-4">
          先去探索菜系
        </ButtonLink>
      </Card>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="apply-email" className="mb-2 block text-small font-bold">
        邮箱
      </label>
      <TextInput
        id="apply-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label htmlFor="apply-message" className="mb-2 mt-5 block text-small font-bold">
        想用小灶做什么？<span className="font-normal text-text-muted">（可选）</span>
      </label>
      <textarea
        id="apply-message"
        maxLength={300}
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full rounded-control border border-border bg-surface px-4 py-3 text-body outline-none placeholder:text-text-muted focus:border-primary"
        placeholder="比如：在英国，想多做几道家常菜"
      />
      <Turnstile onToken={setToken} resetKey={resetKey} />
      <FieldError>{error}</FieldError>
      <Button type="submit" className="mt-4" loading={busy} disabled={!email || (turnstileEnabled && !token)}>
        {busy ? "正在提交…" : "提交申请"}
      </Button>
    </form>
  );
}
