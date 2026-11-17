import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

describe("contentSecurityPolicy", () => {
  it("allows only self, the image origin and Turnstile", () => {
    const csp = contentSecurityPolicy({ dev: false, imageBaseUrl: "https://img.example.com/base" });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob: https://img.example.com");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("adds eval and websockets only in development, and ignores a bad image url", () => {
    const csp = contentSecurityPolicy({ dev: true, imageBaseUrl: "not a url" });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).toContain("img-src 'self' data: blob:;");
  });
});
