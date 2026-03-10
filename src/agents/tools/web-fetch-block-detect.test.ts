import { describe, expect, test } from "vitest";
import { detectBlock, extractRetryAfterMs, isRetryableStatus } from "./web-fetch-block-detect.js";

function makeHeaders(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

describe("detectBlock", () => {
  test("returns not blocked for normal 200 response", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: "<html><body><p>Hello world, this is a real page with enough content to pass checks.</p></body></html>",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(false);
  });

  test("detects rate limiting (429)", () => {
    const result = detectBlock({
      status: 429,
      headers: makeHeaders(),
      body: "Too Many Requests",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("rate_limited");
    expect(result.retryable).toBe(true);
    expect(result.suggestedEscalation).toBe("retry_with_new_headers");
  });

  test("detects Cloudflare challenge page (403 with cf-ray and challenge markers)", () => {
    const result = detectBlock({
      status: 403,
      headers: makeHeaders({ "cf-ray": "abc123" }),
      body: "<html><head><title>Just a moment...</title></head><body>Checking if the site connection is secure</body></html>",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
    expect(result.suggestedEscalation).toBe("scrapling_stealth");
  });

  test("detects Cloudflare challenge page (503 with cf_chl_opt)", () => {
    const result = detectBlock({
      status: 503,
      headers: makeHeaders({ "cf-ray": "xyz789" }),
      body: "<html><body><script>cf_chl_opt={}</script></body></html>",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  test("detects Cloudflare error codes (521-526)", () => {
    for (const status of [521, 522, 523, 524, 525, 526, 530]) {
      const result = detectBlock({
        status,
        headers: makeHeaders({ "cf-ray": "ray123" }),
        body: "Error",
        url: "https://example.com",
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("cloudflare_challenge");
    }
  });

  test("detects Cloudflare challenge on 200 with short body", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: "<html><head><title>Just a moment...</title></head><body>cf-browser-verification challenge-platform</body></html>",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare_challenge");
  });

  test("detects CAPTCHA pages (reCAPTCHA)", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: '<html><body><div class="g-recaptcha" data-sitekey="abc"></div><form>Submit</form></body></html>',
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("captcha");
    expect(result.suggestedEscalation).toBe("scrapling_stealth");
  });

  test("detects CAPTCHA pages (hCaptcha)", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: '<html><body><script src="https://hcaptcha.com/1/api.js"></script></body></html>',
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("captcha");
  });

  test("detects CAPTCHA pages (Turnstile)", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: '<html><body><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>',
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("captcha");
  });

  test("detects WAF block pages (403 with block markers)", () => {
    const result = detectBlock({
      status: 403,
      headers: makeHeaders(),
      body: "<html><body><h1>Attention Required</h1><p>Sorry, you have been blocked</p></body></html>",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("waf_block");
    expect(result.suggestedEscalation).toBe("scrapling_fast");
  });

  test("detects access denied pages (403 with short body)", () => {
    const result = detectBlock({
      status: 403,
      headers: makeHeaders(),
      body: "<html><body><h1>Access Denied</h1></body></html>",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("access_denied");
  });

  test("detects empty response on 200", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: "   ",
      url: "https://example.com",
      contentType: "text/html",
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("empty_response");
  });

  test("does not flag empty JSON response", () => {
    const result = detectBlock({
      status: 200,
      headers: makeHeaders(),
      body: "{}",
      url: "https://api.example.com",
      contentType: "application/json",
    });
    expect(result.blocked).toBe(false);
  });

  test("detects transient 502/503 with short body", () => {
    const result = detectBlock({
      status: 502,
      headers: makeHeaders(),
      body: "Bad Gateway",
      url: "https://example.com",
    });
    expect(result.blocked).toBe(true);
    expect(result.retryable).toBe(true);
  });

  test("does not flag 403 with large body (real page)", () => {
    const longBody = "x".repeat(60_000);
    const result = detectBlock({
      status: 403,
      headers: makeHeaders(),
      body: longBody,
      url: "https://example.com",
    });
    // Large body shouldn't trigger WAF or access_denied (but 403 still not great)
    expect(result.reason).not.toBe("waf_block");
    expect(result.reason).not.toBe("access_denied");
  });
});

describe("extractRetryAfterMs", () => {
  test("parses integer seconds", () => {
    const headers = makeHeaders({ "retry-after": "120" });
    expect(extractRetryAfterMs(headers)).toBe(120_000);
  });

  test("returns undefined when header is absent", () => {
    expect(extractRetryAfterMs(makeHeaders())).toBeUndefined();
  });

  test("returns 0 for past HTTP-date", () => {
    const headers = makeHeaders({ "retry-after": "Wed, 01 Jan 2020 00:00:00 GMT" });
    expect(extractRetryAfterMs(headers)).toBe(0);
  });
});

describe("isRetryableStatus", () => {
  test("429 is retryable", () => expect(isRetryableStatus(429)).toBe(true));
  test("502 is retryable", () => expect(isRetryableStatus(502)).toBe(true));
  test("503 is retryable", () => expect(isRetryableStatus(503)).toBe(true));
  test("521 is retryable", () => expect(isRetryableStatus(521)).toBe(true));
  test("200 is not retryable", () => expect(isRetryableStatus(200)).toBe(false));
  test("404 is not retryable", () => expect(isRetryableStatus(404)).toBe(false));
});
