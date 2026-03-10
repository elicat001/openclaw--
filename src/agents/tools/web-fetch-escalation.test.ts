import { describe, expect, test, vi } from "vitest";
import {
  callScraplingInternal,
  runWithEscalation,
  type DirectFetchFn,
} from "./web-fetch-escalation.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

function makeHeaders(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

describe("runWithEscalation", () => {
  test("returns direct result when not blocked", async () => {
    const directFetch: DirectFetchFn = async () => ({
      status: 200,
      headers: makeHeaders(),
      body: "<html><body><p>Real content that is long enough to not be considered empty by the detector module.</p></body></html>",
      contentType: "text/html",
    });

    const result = await runWithEscalation({
      directFetch,
      firecrawlFallback: async () => null,
      url: "https://example.com",
      maxChars: 50_000,
      config: { maxBlockRetries: 2, scraplingAvailable: false, firecrawlAvailable: false },
    });

    expect(result.type).toBe("direct");
    expect(result.escalationPath).toHaveLength(1);
    expect(result.escalationPath[0].strategy).toBe("direct");
    expect(result.escalationPath[0].outcome).toBe("success");
  });

  test("escalates to firecrawl when blocked and scrapling unavailable", async () => {
    const directFetch: DirectFetchFn = async () => ({
      status: 403,
      headers: makeHeaders({ "cf-ray": "abc123" }),
      body: "<html><head><title>Just a moment...</title></head><body>Checking if the site connection is secure</body></html>",
      contentType: "text/html",
    });

    const firecrawlPayload = { text: "Firecrawl extracted content", url: "https://example.com" };

    const result = await runWithEscalation({
      directFetch,
      firecrawlFallback: async () => firecrawlPayload,
      url: "https://example.com",
      maxChars: 50_000,
      config: { maxBlockRetries: 2, scraplingAvailable: false, firecrawlAvailable: true },
    });

    expect(result.type).toBe("firecrawl");
    if (result.type === "firecrawl") {
      expect(result.payload).toBe(firecrawlPayload);
    }
    // Should have tried direct first, then escalated
    expect(
      result.escalationPath.some((s) => s.strategy === "direct" && s.outcome === "blocked"),
    ).toBe(true);
    expect(
      result.escalationPath.some((s) => s.strategy === "firecrawl" && s.outcome === "success"),
    ).toBe(true);
  });

  test("retries with new headers on rate limit (429)", async () => {
    let callCount = 0;
    const directFetch: DirectFetchFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          status: 429,
          headers: makeHeaders({ "retry-after": "0" }),
          body: "Too Many Requests",
        };
      }
      return {
        status: 200,
        headers: makeHeaders(),
        body: "<html><body><p>Real content that is long enough to not be considered empty response.</p></body></html>",
        contentType: "text/html",
      };
    };

    const result = await runWithEscalation({
      directFetch,
      firecrawlFallback: async () => null,
      url: "https://example.com",
      maxChars: 50_000,
      config: { maxBlockRetries: 2, scraplingAvailable: false, firecrawlAvailable: false },
    });

    expect(result.type).toBe("direct");
    expect(callCount).toBe(2);
    expect(result.escalationPath.some((s) => s.strategy === "retry_with_new_headers")).toBe(true);
  });

  test("returns last direct result when all strategies exhausted", async () => {
    const directFetch: DirectFetchFn = async () => ({
      status: 403,
      headers: makeHeaders(),
      body: "<html><body><h1>Access Denied</h1></body></html>",
      contentType: "text/html",
    });

    const result = await runWithEscalation({
      directFetch,
      firecrawlFallback: async () => null,
      url: "https://example.com",
      maxChars: 50_000,
      config: { maxBlockRetries: 2, scraplingAvailable: false, firecrawlAvailable: false },
    });

    expect(result.type).toBe("direct");
    if (result.type === "direct") {
      expect(result.status).toBe(403);
    }
    // Should have attempted escalation
    expect(result.escalationPath.length).toBeGreaterThan(1);
  });

  test("handles network error and falls back to firecrawl", async () => {
    const directFetch: DirectFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };

    const firecrawlPayload = { text: "Content from firecrawl" };

    const result = await runWithEscalation({
      directFetch,
      firecrawlFallback: async () => firecrawlPayload,
      url: "https://example.com",
      maxChars: 50_000,
      config: { maxBlockRetries: 2, scraplingAvailable: false, firecrawlAvailable: true },
    });

    expect(result.type).toBe("firecrawl");
  });

  test("throws when network error and no fallback available", async () => {
    const directFetch: DirectFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };

    await expect(
      runWithEscalation({
        directFetch,
        firecrawlFallback: async () => null,
        url: "https://example.com",
        maxChars: 50_000,
        config: { maxBlockRetries: 2, scraplingAvailable: false, firecrawlAvailable: false },
      }),
    ).rejects.toThrow("ECONNREFUSED");
  });
});

describe("callScraplingInternal", () => {
  test("returns null when scrapling is not installed", async () => {
    // With mocked child_process that doesn't respond properly, should return null
    const result = await callScraplingInternal({
      url: "https://example.com",
      mode: "fast",
      maxChars: 50_000,
    });
    expect(result).toBeNull();
  });
});
