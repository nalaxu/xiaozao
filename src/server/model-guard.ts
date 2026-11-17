// 模型类接口的公共检查：登录、同源、每账号每分钟限流（技术方案 9.3）。
import type { NextRequest } from "next/server";
import { rate } from "@config/limits";
import { getCurrentUser } from "./auth/current";
import { getDb } from "./db";
import { forbiddenOrigin, jsonError, sameOrigin } from "./http";
import { hit } from "./ratelimit";

export async function guardModelRoute(req: NextRequest) {
  if (!sameOrigin(req)) return { error: forbiddenOrigin() } as const;
  const user = await getCurrentUser();
  if (!user) return { error: jsonError(401, "请先登录", { code: "auth" }) } as const;
  const db = await getDb();
  const r = await hit(db, {
    bucket: "model:user",
    key: user.id,
    windowSeconds: 60,
    limit: rate.modelCallsPerUserPerMinute,
  });
  if (!r.ok) {
    return {
      error: jsonError(429, `操作太频繁，请 ${r.retryAfter} 秒后再试`, { code: "rate", retryAfter: r.retryAfter }),
    } as const;
  }
  return { user, db } as const;
}
