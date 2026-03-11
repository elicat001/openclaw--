/**
 * User-Agent rotation pool, browser identity management, and realistic
 * browser header generation for anti-bot evasion in web fetching.
 */

import { createBrowserFingerprint } from "./web-fetch-fingerprint-db.js";

// ── Types ────────────────────────────────────────────────────────

/** A frozen browser identity for an entire crawl session. All headers are derived consistently. */
export type BrowserIdentity = {
  userAgent: string;
  platform: "macOS" | "Windows" | "Linux" | "Android" | "iOS";
  browserFamily: "chrome" | "firefox" | "safari" | "edge";
  browserVersion: string;
  secChUA: string | null;
  acceptLanguage: string;
  viewport: { width: number; height: number };
};

// ── Constants ────────────────────────────────────────────────────

const _VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1680, height: 1050 },
] as const;

/** Modern, realistic User-Agent strings covering Chrome, Firefox, and Safari on macOS/Windows. */
const USER_AGENT_POOL = [
  // Chrome 131 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  // Chrome 130 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  // Chrome 129 Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  // Chrome 131 Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  // Chrome 128 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  // Chrome 127 Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  // Chrome 126 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  // Firefox 132 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
  // Firefox 131 Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  // Firefox 130 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
  // Safari 17.6 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  // Safari 17.5 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  // Chrome 125 macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  // Chrome 124 Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
] as const;

const ACCEPT_LANGUAGE_POOL = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.9",
  "en-US,en;q=0.9,zh-CN;q=0.8",
  "en-US,en;q=0.5",
  "en,en-US;q=0.9",
] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Select a random User-Agent from the pool. */
export function pickUserAgent(): string {
  return pickRandom(USER_AGENT_POOL);
}

const CHROME_VERSION_RE = /Chrome\/(\d+)/;
const FIREFOX_VERSION_RE = /Firefox\/(\d+)/;

/** Extract Chrome major version from a User-Agent string, or undefined if not Chrome. */
export function parseChromeVersionFromUA(ua: string): string | undefined {
  const match = CHROME_VERSION_RE.exec(ua);
  return match?.[1];
}

function isFirefoxUA(ua: string): boolean {
  return FIREFOX_VERSION_RE.test(ua);
}

function isSafariOnlyUA(ua: string): boolean {
  return ua.includes("Safari/") && !ua.includes("Chrome/") && !ua.includes("Firefox/");
}

function derivePlatformFromUA(ua: string): string {
  if (ua.includes("Windows")) {
    return '"Windows"';
  }
  if (ua.includes("Macintosh") || ua.includes("Mac OS X")) {
    return '"macOS"';
  }
  return '"Unknown"';
}

function buildSecChUA(chromeVersion: string): string {
  // Chromium-based Sec-CH-UA includes brand, Chromium, and a "Not" brand with rotating punctuation
  return `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"`;
}

/**
 * Build a realistic set of browser request headers that vary per call.
 * The generated headers mimic real browser navigation requests.
 */
export function buildBrowserHeaders(params: {
  userAgent: string;
  acceptMarkdown?: boolean;
}): Record<string, string> {
  const { userAgent } = params;
  const headers: Record<string, string> = {};

  headers["User-Agent"] = userAgent;
  headers["Accept-Language"] = pickRandom(ACCEPT_LANGUAGE_POOL);
  headers["Accept-Encoding"] = "gzip, deflate, br";

  // Accept header: prefer markdown when available, fall back to HTML
  if (params.acceptMarkdown) {
    headers["Accept"] = "text/markdown, text/html;q=0.9, */*;q=0.1";
  } else {
    headers["Accept"] =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
  }

  const chromeVersion = parseChromeVersionFromUA(userAgent);

  if (chromeVersion) {
    // Chrome-specific headers
    headers["Sec-CH-UA"] = buildSecChUA(chromeVersion);
    headers["Sec-CH-UA-Mobile"] = "?0";
    headers["Sec-CH-UA-Platform"] = derivePlatformFromUA(userAgent);
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = "none";
    headers["Sec-Fetch-User"] = "?1";
    headers["Upgrade-Insecure-Requests"] = "1";
  } else if (isFirefoxUA(userAgent)) {
    // Firefox sends Sec-Fetch but not Sec-CH-UA
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = "none";
    headers["Sec-Fetch-User"] = "?1";
    headers["Upgrade-Insecure-Requests"] = "1";
  } else if (isSafariOnlyUA(userAgent)) {
    // Safari doesn't send Sec-CH-UA or Sec-Fetch headers
    headers["Upgrade-Insecure-Requests"] = "1";
  }

  // Randomly include DNT header (~30% of requests) unless identity locks it
  if (Math.random() < 0.3) {
    headers["DNT"] = "1";
  }

  return headers;
}

// ── Session-level identity ───────────────────────────────────────

/**
 * Create a frozen browser identity for an entire crawl session.
 * Delegates to the weighted fingerprint database for wider UA coverage.
 */
export function createBrowserIdentity(): BrowserIdentity {
  return createBrowserFingerprint();
}

/**
 * Build browser headers using a locked BrowserIdentity.
 * Ensures all headers are internally consistent for the session.
 */
export function buildIdentityHeaders(params: {
  identity: BrowserIdentity;
  referer?: string;
  targetUrl?: string;
  acceptMarkdown?: boolean;
}): Record<string, string> {
  const { identity, referer, targetUrl } = params;
  const headers: Record<string, string> = {};

  headers["User-Agent"] = identity.userAgent;
  headers["Accept-Language"] = identity.acceptLanguage;
  headers["Accept-Encoding"] = "gzip, deflate, br";

  if (params.acceptMarkdown) {
    headers["Accept"] = "text/markdown, text/html;q=0.9, */*;q=0.1";
  } else {
    headers["Accept"] =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
  }

  const isMobile = identity.platform === "Android" || identity.platform === "iOS";

  if (identity.browserFamily === "chrome" || identity.browserFamily === "edge") {
    headers["Sec-CH-UA"] = identity.secChUA!;
    headers["Sec-CH-UA-Mobile"] = isMobile ? "?1" : "?0";
    headers["Sec-CH-UA-Platform"] = `"${identity.platform}"`;
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-User"] = "?1";
    headers["Upgrade-Insecure-Requests"] = "1";

    // Sec-Fetch-Site depends on referer
    if (referer && targetUrl) {
      headers["Sec-Fetch-Site"] = isSameOrigin(referer, targetUrl) ? "same-origin" : "cross-site";
    } else if (referer) {
      headers["Sec-Fetch-Site"] = "cross-site";
    } else {
      headers["Sec-Fetch-Site"] = "none";
    }
  } else if (identity.browserFamily === "firefox") {
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = referer ? "cross-site" : "none";
    headers["Sec-Fetch-User"] = "?1";
    headers["Upgrade-Insecure-Requests"] = "1";
  } else {
    headers["Upgrade-Insecure-Requests"] = "1";
  }

  if (referer) {
    headers["Referer"] = referer;
  }

  return headers;
}

function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
