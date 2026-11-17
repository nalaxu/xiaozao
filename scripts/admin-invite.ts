// 生成邀请码（用于第一位管理员注册，或后台不可用时）。
// 用法：npm run admin:invite -- [数量] [每个可用次数] [有效天数]
// 连接 DATABASE_URL；未配置时写入本地 PGlite（.data/pglite）。
import { createInviteCodes } from "../src/server/admin";
import { getDb } from "../src/server/db/client";

async function main() {
  const [count = "1", maxUses = "1", days = "30"] = process.argv.slice(2);
  const db = await getDb();
  const codes = await createInviteCodes(db, {
    count: Number(count),
    maxUses: Number(maxUses),
    expiresInDays: Number(days) || null,
    note: "命令行生成",
    createdBy: null,
  });
  console.log(`目标数据库：${process.env.DATABASE_URL ? "DATABASE_URL" : "本地 PGlite"}`);
  for (const c of codes) {
    console.log(`${c.code}  可用 ${c.maxUses} 次  ${c.expiresAt ? `到期 ${c.expiresAt.toISOString()}` : "不过期"}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
