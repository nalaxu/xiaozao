import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/login-panel";
import { getCurrentUser } from "@/server/auth/current";
import { googleConfigured } from "@/server/auth/google";
import { safeNext } from "@/server/http";

export const metadata: Metadata = { title: "登录" };

const ERRORS: Record<string, string> = {
  google_unavailable: "Google 登录暂未开通，请先用邮箱验证码登录。",
  google_failed: "Google 登录没有完成，请再试一次。",
  disabled: "账号已暂停使用，如有疑问请联系我们。",
};

type Props = { searchParams: Promise<{ next?: string; error?: string; reason?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, error, reason } = await searchParams;
  const next = safeNext(rawNext);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="mx-auto max-w-[420px] pt-4">
      <p className="text-h2 font-bold text-primary">小灶</p>
      <h1 className="mt-6 text-h1 font-bold">
        {reason === "photo" ? "登录后可拍照识别食材" : "登录后就能拿到推荐了"}
      </h1>
      <p className="mb-6 mt-1 text-text-muted">
        拍照识别、推荐和生成教程都需要登录。已经选好的食材和口味会保留。
      </p>
      <LoginPanel next={next} googleEnabled={googleConfigured()} initialError={error ? ERRORS[error] : null} />
    </div>
  );
}
