// 普通（非模型）接口的公共检查：写操作要求同源；都要求登录。
import type { NextRequest } from "next/server";
import { getCurrentUser } from "./auth/current";
import { getDb } from "./db";
import { forbiddenOrigin, jsonError, sameOrigin } from "./http";

export async function apiUser(req: NextRequest, { write }: { write: boolean }) {
  if (write && !sameOrigin(req)) return { error: forbiddenOrigin() } as const;
  const user = await getCurrentUser();
  if (!user) return { error: jsonError(401, "请先登录", { code: "auth" }) } as const;
  return { user, db: await getDb() } as const;
}
