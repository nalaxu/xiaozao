// 测试用：每个测试文件一份内存 PGlite，已应用迁移。
import { openPglite, type Db } from "./db/client";
import type { Mail } from "./mail";

export async function testDb(): Promise<Db> {
  return openPglite();
}

export function mailbox() {
  const sent: Mail[] = [];
  return {
    sent,
    send: async (m: Mail) => {
      sent.push(m);
    },
    lastCode(to: string) {
      const m = [...sent].reverse().find((x) => x.to === to);
      return m?.subject.match(/(\d{6})/)?.[1];
    },
  };
}

export const at = (iso: string) => new Date(iso);

/** 在给定时间基础上加秒数 */
export const plus = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);
