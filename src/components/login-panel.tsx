"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, FieldError, postJson, TextInput } from "@/components/form";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";
import { otp } from "@config/limits";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

export function LoginPanel({
  next,
  googleEnabled,
  initialError,
}: {
  next: string;
  googleEnabled: boolean;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    setError(null);
    setBusy(true);
    const res = await postJson<{ retryAfter?: number }>("/api/auth/email/start", { email, turnstileToken: token });
    setBusy(false);
    setResetKey((k) => k + 1); // Turnstile 令牌只能用一次
    if (!res.ok) {
      setError(res.data.error ?? "发送失败，请稍后再试");
      if (res.data.retryAfter) setCooldown(res.data.retryAfter);
      return;
    }
    setStep("code");
    setCode("");
    setCooldown(otp.resendSeconds);
  }

  async function verify(value = code) {
    setError(null);
    setBusy(true);
    const res = await postJson<{ next?: string }>("/api/auth/email/verify", { email, code: value, next });
    setBusy(false);
    if (!res.ok || !res.data.next) {
      setError(res.data.error ?? "验证码错误或已过期");
      return;
    }
    router.replace(res.data.next);
    router.refresh();
  }

  const needToken = turnstileEnabled && !token;

  return (
    <div>
      {googleEnabled && (
        <>
          <a
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
            className="flex h-[52px] w-full items-center justify-center gap-3 rounded-control border border-border bg-surface font-bold active:bg-surface-muted"
          >
            <GoogleIcon />
            使用 Google 继续
          </a>
          <div className="my-5 flex items-center gap-3 text-small text-text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />或<span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <label htmlFor="email" className="mb-2 block text-small font-bold">
            邮箱
          </label>
          <TextInput
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Turnstile onToken={setToken} resetKey={resetKey} />
          <FieldError>{error}</FieldError>
          <Button type="submit" className="mt-4" loading={busy} disabled={!email || needToken || cooldown > 0}>
            {busy ? "正在发送…" : cooldown > 0 ? `${cooldown} 秒后可重新发送` : "发送验证码"}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="mb-1">验证码已发送，请查收。</p>
          <p className="mb-4 text-small text-text-muted">
            发到 {email}，10 分钟内有效。
            <button type="button" className="ml-1 text-primary" onClick={() => setStep("email")}>
              换个邮箱
            </button>
          </p>
          <label htmlFor="code" className="mb-2 block text-small font-bold">
            6 位验证码
          </label>
          <TextInput
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void verify(v);
            }}
            className="tabular text-center text-h1 tracking-[0.5em]"
          />
          <FieldError>{error}</FieldError>
          <Button type="submit" className="mt-4" loading={busy} disabled={code.length !== 6}>
            {busy ? "正在验证…" : "登录"}
          </Button>
          <Turnstile onToken={setToken} resetKey={resetKey} />
          <Button
            type="button"
            variant="ghost"
            className="mt-2"
            disabled={cooldown > 0 || busy || needToken}
            onClick={() => void sendCode()}
          >
            {cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送验证码"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-small text-text-muted">
        小灶目前凭邀请码注册。新邮箱验证后会请你填写邀请码。
        <br />
        <Link href="/login/apply" className="text-primary">
          没有邀请码？申请一个 →
        </Link>
      </p>
    </div>
  );
}
