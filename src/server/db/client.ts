// 数据库连接。
// - 配置了 DATABASE_URL：连接 Neon（WebSocket 连接池，支持事务）。
// - 未配置且非生产环境：使用本地 PGlite（.data/pglite），首次启动自动建表，方便不开通 Neon 也能本地开发。
//   本地用 next start 试生产构建时，显式设置 PGLITE_DIR 也会使用 PGlite。
// - 测试：用 setDbForTests 注入内存 PGlite。
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __xzDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    return drizzle({ client: new Pool({ connectionString: url }), schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) {
    throw new Error("DATABASE_URL 未配置");
  }
  return openPglite(process.env.PGLITE_DIR ?? ".data/pglite");
}

/** 打开 PGlite 并应用迁移；dir 为 undefined 时使用内存库 */
export async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dir) {
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(dir), { recursive: true });
  }
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!g.__xzDb) {
    g.__xzDb = connect().catch((err) => {
      g.__xzDb = undefined;
      throw err;
    });
  }
  return g.__xzDb;
}

export function setDbForTests(db: Db) {
  g.__xzDb = Promise.resolve(db);
}

export { schema };
