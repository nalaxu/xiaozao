"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FieldError, postJson, TextInput } from "@/components/form";

export function InviteForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await postJson<{ next?: string; reason?: string }>("/api/auth/invite", { code, next });
    setBusy(false);
    if (!res.ok || !res.data.next) {
      setError(res.data.error ?? "邀请码无效或已用完");
      setExpired(res.data.reason === "pending_expired");
      return;
    }
    router.replace(res.data.next);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="invite" className="mb-2 block text-small font-bold">
        邀请码
      </label>
      <TextInput
        id="invite"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus
        maxLength={20}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
        placeholder="8 位字母和数字"
        className="tabular tracking-[0.2em]"
      />
      <FieldError>{error}</FieldError>
      {expired ? (
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="mt-4 flex h-[52px] items-center justify-center rounded-control bg-primary font-bold text-primary-contrast"
        >
          重新验证邮箱
        </Link>
      ) : (
        <Button type="submit" className="mt-4" loading={busy} disabled={code.length < 4}>
          {busy ? "正在注册…" : "完成注册"}
        </Button>
      )}
    </form>
  );
}
