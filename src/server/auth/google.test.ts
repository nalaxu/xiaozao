import { describe, expect, it } from "vitest";
import { safeNext } from "../http";
import { parseIdToken } from "./google";

const token = (payload: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

const good = {
  iss: "https://accounts.google.com",
  aud: "client-1",
  exp: Math.floor(Date.UTC(2026, 10, 17, 11) / 1000),
  sub: "123",
  email: "a@gmail.com",
  email_verified: true,
  name: "阿明",
};
const now = Date.UTC(2026, 10, 17, 10);

describe("Google id_token 校验", () => {
  it("合法令牌返回资料", () => {
    expect(parseIdToken(token(good), "client-1", now)).toEqual({ sub: "123", email: "a@gmail.com", name: "阿明" });
  });

  it.each([
    ["aud 不对", { aud: "other" }],
    ["iss 不对", { iss: "https://evil.example" }],
    ["已过期", { exp: Math.floor(now / 1000) - 1 }],
    ["邮箱未验证", { email_verified: false }],
    ["缺少邮箱", { email: undefined }],
  ])("%s时拒绝", (_, patch) => {
    expect(() => parseIdToken(token({ ...good, ...patch }), "client-1", now)).toThrow();
  });
});

describe("登录后跳转地址", () => {
  it.each([
    ["/recommend?resume=1", "/recommend?resume=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
