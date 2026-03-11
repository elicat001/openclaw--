import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createProxyPool } from "./web-fetch-proxy-pool.js";
import type { ProxyConfig } from "./web-fetch-proxy-pool.js";

describe("createProxyPool", () => {
  test("empty pool returns null", () => {
    const pool = createProxyPool({ envVarNames: [] });
    expect(pool.getProxy("example.com")).toBeNull();
    expect(pool.size).toBe(0);
  });

  test("round-robin rotation", () => {
    const proxies: ProxyConfig[] = [
      { url: "http://a:8080" },
      { url: "http://b:8080" },
      { url: "http://c:8080" },
    ];
    const pool = createProxyPool({ proxies, strategy: "round-robin", envVarNames: [] });
    expect(pool.size).toBe(3);

    const first = pool.getProxy("example.com");
    const second = pool.getProxy("example.com");
    const third = pool.getProxy("example.com");
    // All three should be from the pool and rotate
    const urls = [first?.url, second?.url, third?.url];
    expect(urls).toContain("http://a:8080");
    expect(urls).toContain("http://b:8080");
    expect(urls).toContain("http://c:8080");
  });

  test("dead proxy cooldown: mark failed 5x triggers skip", () => {
    const proxies: ProxyConfig[] = [{ url: "http://a:8080" }, { url: "http://b:8080" }];
    const pool = createProxyPool({
      proxies,
      strategy: "round-robin",
      maxConsecutiveFailures: 5,
      cooldownMs: 60_000,
      envVarNames: [],
    });

    const proxyA: ProxyConfig = { url: "http://a:8080" };
    for (let i = 0; i < 5; i++) {
      pool.markFailed(proxyA);
    }

    // After 5 failures, proxy A should be in cooldown; all results should be B
    const results = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const p = pool.getProxy("test.com");
      if (p) {
        results.add(p.url);
      }
    }
    expect(results.size).toBe(1);
    expect(results.has("http://b:8080")).toBe(true);

    const stats = pool.getStats();
    const healthA = stats.get("http://a:8080");
    expect(healthA?.consecutiveFailures).toBe(5);
    expect(healthA?.failCount).toBe(5);
    expect(healthA?.cooldownUntil).toBeGreaterThan(0);
  });

  test("recovery after cooldown", () => {
    const proxies: ProxyConfig[] = [{ url: "http://a:8080" }];
    const pool = createProxyPool({
      proxies,
      strategy: "round-robin",
      maxConsecutiveFailures: 2,
      cooldownMs: 100,
      envVarNames: [],
    });

    pool.markFailed({ url: "http://a:8080" });
    pool.markFailed({ url: "http://a:8080" });

    // Should be in cooldown now
    expect(pool.getProxy("test.com")).toBeNull();

    // Mock Date.now to simulate time passing
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realNow() + 200);

    // After cooldown, proxy should be available again
    expect(pool.getProxy("test.com")).not.toBeNull();

    vi.restoreAllMocks();
  });

  test("domain affinity returns same proxy for same domain", () => {
    const proxies: ProxyConfig[] = [
      { url: "http://a:8080" },
      { url: "http://b:8080" },
      { url: "http://c:8080" },
    ];
    const pool = createProxyPool({
      proxies,
      strategy: "domain-affinity",
      envVarNames: [],
    });

    const first = pool.getProxy("shopee.com");
    const second = pool.getProxy("shopee.com");
    const third = pool.getProxy("shopee.com");
    expect(first?.url).toBe(second?.url);
    expect(second?.url).toBe(third?.url);
  });

  describe("env var proxy loading", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.HTTP_PROXY = "http://env-proxy:3128";
      process.env.HTTPS_PROXY = "http://env-proxy-s:3129";
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test("loads proxies from env vars", () => {
      const pool = createProxyPool();
      expect(pool.size).toBeGreaterThanOrEqual(2);
      const proxy = pool.getProxy("example.com");
      expect(proxy).not.toBeNull();
    });

    test("deduplicates same URL across env vars", () => {
      process.env.ALL_PROXY = "http://env-proxy:3128"; // same as HTTP_PROXY
      const pool = createProxyPool({ envVarNames: ["HTTP_PROXY", "ALL_PROXY"] });
      expect(pool.size).toBe(1);
    });
  });

  test("markSuccess updates stats", () => {
    const proxies: ProxyConfig[] = [{ url: "http://a:8080" }];
    const pool = createProxyPool({ proxies, envVarNames: [] });

    pool.markSuccess({ url: "http://a:8080" }, 100);
    pool.markSuccess({ url: "http://a:8080" }, 200);

    const stats = pool.getStats();
    const h = stats.get("http://a:8080");
    expect(h).toBeDefined();
    expect(h!.successCount).toBe(2);
    expect(h!.consecutiveFailures).toBe(0);
    // First call: avg = 100, second: 100*0.7 + 200*0.3 = 130
    expect(h!.avgLatencyMs).toBeCloseTo(130, 1);
  });

  test("markSuccess resets consecutive failures", () => {
    const proxies: ProxyConfig[] = [{ url: "http://a:8080" }];
    const pool = createProxyPool({ proxies, envVarNames: [], maxConsecutiveFailures: 10 });

    pool.markFailed({ url: "http://a:8080" });
    pool.markFailed({ url: "http://a:8080" });
    pool.markSuccess({ url: "http://a:8080" });

    const h = pool.getStats().get("http://a:8080");
    expect(h!.consecutiveFailures).toBe(0);
    expect(h!.failCount).toBe(2);
    expect(h!.successCount).toBe(1);
  });

  test("addProxies adds to pool", () => {
    const pool = createProxyPool({ proxies: [{ url: "http://a:8080" }], envVarNames: [] });
    expect(pool.size).toBe(1);

    pool.addProxies([{ url: "http://b:8080" }, { url: "http://c:8080" }]);
    expect(pool.size).toBe(3);

    // Deduplicates
    pool.addProxies([{ url: "http://a:8080" }]);
    expect(pool.size).toBe(3);
  });

  test("LRU strategy picks least recently used", () => {
    const proxies: ProxyConfig[] = [{ url: "http://a:8080" }, { url: "http://b:8080" }];
    const pool = createProxyPool({
      proxies,
      strategy: "least-recently-used",
      envVarNames: [],
    });

    // Both start at lastUsedMs=0, so first pick is deterministic (first in list)
    const first = pool.getProxy("test.com");
    expect(first?.url).toBe("http://a:8080");

    // Now A was recently used, so B should be picked
    const second = pool.getProxy("test.com");
    expect(second?.url).toBe("http://b:8080");
  });
});
