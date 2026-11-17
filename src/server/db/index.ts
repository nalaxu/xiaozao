import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let instance: NeonHttpDatabase<typeof schema> | null = null;

/** 首次使用时才连接，没有配置 DATABASE_URL 时只有用到数据库的功能会报错 */
export function db(): NeonHttpDatabase<typeof schema> {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 未配置");
    instance = drizzle(neon(url), { schema });
  }
  return instance;
}

export { schema };
