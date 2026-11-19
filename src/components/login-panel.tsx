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
  // start：填邮箱（新用户连同邀请码）→ code：同一页填验证码 → invite：邮箱已验证但缺邀请码或码不对，同一页补填
  const [phase, setPhase] = useState<"start" | "code" | "invite">("start");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (target: string) => {
    router.replace(target);
    router.refresh();
  };

  async function sendCode() {
    setError(null);
    setInviteError(null);
    setBusy(true);
    const res = await postJson<{ retryAfter?: number; field?: string }>("/api/auth/email/start", {
      email,
      inviteCode: invite || undefined,
      turnstileToken: token,
    });
    setBusy(false);
    setResetKey((k) => k + 1); // Turnstile 令牌只能用一次
    if (!res.ok) {
      const message = res.data.error ?? "发送失败，请稍后再试";
      if (res.data.field === "invite") setInviteError(message);
      else setError(message);
      if (res.data.retryAfter) setCooldown(res.data.retryAfter);
      return;
    }
    setPhase("code");
    setCode("");
    setCooldown(otp.resendSeconds);
  }

  async function verify(value = code) {
    setError(null);
    setInviteError(null);
    setBusy(true);
    const res = await postJson<{ next?: string; needInvite?: boolean }>("/api/auth/email/verify", {
      email,
      code: value,
      inviteCode: invite || undefined,
      next,
    });
    setBusy(false);
    if (res.ok && res.data.needInvite) {
      setPhase("invite");
      setInviteError(res.data.error ?? "这个邮箱还没注册，填写邀请码就能完成注册");
      return;
    }
    if (!res.ok || !res.data.next) {
      setError(res.data.error ?? "验证码错误或已过期");
      return;
    }
    go(res.data.next);
  }

  async function redeem() {
    setInviteError(null);
    setBusy(true);
    const res = await postJson<{ next?: string; reason?: string }>("/api/auth/invite", { code: invite, next });
    setBusy(false);
    if (res.ok && res.data.next) return go(res.data.next);
    if (res.data.reason === "pending_expired") {
      setPhase("start");
      setError("验证已过期（30 分钟），请重新发送验证码");
      return;
    }
    setInviteError(res.data.error ?? "邀请码无效或已用完");
  }

  function restart() {
    setPhase("start");
    setCode("");
    setError(null);
    setInviteError(null);
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phase === "start") void sendCode();
          else if (phase === "code") void verify();
          else void redeem();
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
          readOnly={phase !== "start"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={phase !== "start" ? "bg-surface-muted text-text-muted" : ""}
        />
        {phase !== "start" && (
          <button type="button" className="mt-2 text-small text-primary" onClick={restart}>
            换个邮箱
          </button>
        )}

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <label htmlFor="invite" className="text-small font-bold">
            邀请码
          </label>
          <Link href="/login/apply" className="shrink-0 text-small text-primary">
            没有邀请码？申请一个
          </Link>
        </div>
        <p className="mt-1 text-small text-text-muted">新用户必填，已注册的邮箱不用填</p>
        <TextInput
          id="invite"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          autoFocus={phase === "invite"}
          value={invite}
          onChange={(e) => {
            setInvite(e.target.value.toUpperCase().replace(/\s/g, ""));
            setInviteError(null);
          }}
          placeholder="8 位字母和数字"
          className="mt-2 tabular tracking-[0.2em]"
        />
        <FieldError>{inviteError}</FieldError>

        {phase === "start" && (
          <>
            <Turnstile onToken={setToken} resetKey={resetKey} />
            <FieldError>{error}</FieldError>
            <Button type="submit" className="mt-4" loading={busy} disabled={!email || needToken || cooldown > 0}>
              {busy ? "正在发送…" : cooldown > 0 ? `${cooldown} 秒后可重新发送` : "发送验证码"}
            </Button>
          </>
        )}

        {phase === "code" && (
          <>
            <label htmlFor="code" className="mb-2 mt-5 block text-small font-bold">
              6 位验证码
              <span className="ml-1 font-normal text-text-muted">已发到上面的邮箱，10 分钟内有效</span>
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
              {busy ? "正在验证…" : invite ? "注册并登录" : "登录"}
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
          </>
        )}

        {phase === "invite" && (
          <>
            <p className="mt-5 text-small text-text-muted">邮箱已验证，不用再收验证码。填好邀请码就能完成注册。</p>
            <Button type="submit" className="mt-4" loading={busy} disabled={invite.length < 4}>
              {busy ? "正在注册…" : "完成注册"}
            </Button>
          </>
        )}
      </form>

      <p className="mt-6 text-small text-text-muted">小灶目前凭邀请码注册，已注册的邮箱直接登录即可。</p>
      <p className="mt-2 text-small text-text-muted">
        登录即表示你同意我们按
        <Link href="/privacy" className="underline underline-offset-2">
          隐私政策
        </Link>
        处理你的邮箱等信息。
      </p>
    </div>
  );
}
