import { describe, expect, test } from "vitest";
import {
  buildBrowserHeaders,
  parseChromeVersionFromUA,
  pickUserAgent,
} from "./web-fetch-headers.js";

describe("pickUserAgent", () => {
  test("returns a non-empty string", () => {
    const ua = pickUserAgent();
    expect(ua).toBeTruthy();
    expect(typeof ua).toBe("string");
  });

  test("returns different UAs over many calls (randomized)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(pickUserAgent());
    }
    // Should see at least a few different UAs
    expect(seen.size).toBeGreaterThan(1);
  });

  test("all UAs contain Mozilla/5.0", () => {
    for (let i = 0; i < 50; i++) {
      expect(pickUserAgent()).toContain("Mozilla/5.0");
    }
  });
});

describe("parseChromeVersionFromUA", () => {
  test("extracts Chrome version from Chrome UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    expect(parseChromeVersionFromUA(ua)).toBe("131");
  });

  test("returns undefined for Firefox UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";
    expect(parseChromeVersionFromUA(ua)).toBeUndefined();
  });

  test("returns undefined for Safari UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
    expect(parseChromeVersionFromUA(ua)).toBeUndefined();
  });
});

describe("buildBrowserHeaders", () => {
  test("includes User-Agent header", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0";
    const headers = buildBrowserHeaders({ userAgent: ua });
    expect(headers["User-Agent"]).toBe(ua);
  });

  test("includes Accept-Language and Accept-Encoding", () => {
    const headers = buildBrowserHeaders({ userAgent: pickUserAgent() });
    expect(headers["Accept-Language"]).toBeTruthy();
    expect(headers["Accept-Encoding"]).toBe("gzip, deflate, br");
  });

  test("generates Sec-CH-UA headers for Chrome UAs", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const headers = buildBrowserHeaders({ userAgent: ua });
    expect(headers["Sec-CH-UA"]).toContain("131");
    expect(headers["Sec-CH-UA-Mobile"]).toBe("?0");
    expect(headers["Sec-CH-UA-Platform"]).toBe('"macOS"');
    expect(headers["Sec-Fetch-Dest"]).toBe("document");
  });

  test("does not include Sec-CH-UA for Safari UAs", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
    const headers = buildBrowserHeaders({ userAgent: ua });
    expect(headers["Sec-CH-UA"]).toBeUndefined();
    expect(headers["Sec-Fetch-Dest"]).toBeUndefined();
    expect(headers["Upgrade-Insecure-Requests"]).toBe("1");
  });

  test("uses markdown accept header when acceptMarkdown is true", () => {
    const headers = buildBrowserHeaders({ userAgent: pickUserAgent(), acceptMarkdown: true });
    expect(headers["Accept"]).toContain("text/markdown");
  });

  test("uses standard HTML accept header when acceptMarkdown is false", () => {
    const headers = buildBrowserHeaders({ userAgent: pickUserAgent(), acceptMarkdown: false });
    expect(headers["Accept"]).toContain("text/html");
    expect(headers["Accept"]).not.toContain("text/markdown");
  });

  test("derives platform from Windows UA", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const headers = buildBrowserHeaders({ userAgent: ua });
    expect(headers["Sec-CH-UA-Platform"]).toBe('"Windows"');
  });
});
