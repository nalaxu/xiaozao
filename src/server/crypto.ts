import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function hmac(value: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("OTP_SECRET 未配置");
  }
  return createHmac("sha256", secret || "dev-only-otp-secret").update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** 6 位数字验证码 */
export const otpCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

/** 邀请码字母表：去掉易混的 0/O、1/I/L（技术方案 5.5） */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function inviteCode(length = 8): string {
  let s = "";
  for (let i = 0; i < length; i++) s += INVITE_ALPHABET[randomInt(0, INVITE_ALPHABET.length)];
  return s;
}

export const normalizeInviteCode = (input: string) => input.toUpperCase().replace(/[\s-]+/g, "");

export const normalizeEmail = (input: string) => input.trim().toLowerCase();
