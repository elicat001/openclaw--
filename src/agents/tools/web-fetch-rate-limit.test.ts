import { describe, expect, test } from "vitest";
import { createDomainRateLimiter, extractDomain } from "./web-fetch-rate-limit.js";

describe("extractDomain", () => {
  test("extracts hostname from URL", () => {
    expect(extractDomain("https://example.com/page")).toBe("example.com");
  });

  test("extracts hostname with port", () => {
    expect(extractDomain("http://localhost:3000/api")).toBe("localhost");
  });

  test("returns 'unknown' for invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("unknown");
  });
});

describe("createDomainRateLimiter", () => {
  test("allows requests within limit", async () => {
    const limiter = createDomainRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    // Should not throw or block for 3 requests
    await limiter.waitForSlot("example.com");
    await limiter.waitForSlot("example.com");
    await limiter.waitForSlot("example.com");
    expect(limiter.size).toBe(1);
  });

  test("isolates domains independently", async () => {
    const limiter = createDomainRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    await limiter.waitForSlot("a.com");
    await limiter.waitForSlot("b.com");
    await limiter.waitForSlot("a.com");
    await limiter.waitForSlot("b.com");
    expect(limiter.size).toBe(2);
  });

  test("reset clears all domains", async () => {
    const limiter = createDomainRateLimiter();
    await limiter.waitForSlot("example.com");
    expect(limiter.size).toBe(1);
    limiter.reset();
    expect(limiter.size).toBe(0);
  });

  test("uses default config when no params", () => {
    const limiter = createDomainRateLimiter();
    expect(limiter.size).toBe(0);
  });
});
