/**
 * Weighted browser fingerprint database for realistic identity generation.
 * Replaces the hardcoded 14-UA pool in web-fetch-headers.ts with 35+ weighted
 * entries and consistent identity derivation.
 */

import type { BrowserIdentity } from "./web-fetch-headers.js";

// ── Types ────────────────────────────────────────────────────────

/** Wider identity type for Phase 3 (edge browser, mobile platforms). */
export type ExtendedBrowserIdentity = {
  userAgent: string;
  platform: "macOS" | "Windows" | "Linux" | "Android" | "iOS";
  browserFamily: "chrome" | "firefox" | "safari" | "edge";
  browserVersion: string;
  secChUA: string | null;
  acceptLanguage: string;
  viewport: { width: number; height: number };
};

type WeightedUA = {
  ua: string;
  weight: number;
  browser: "chrome" | "firefox" | "safari" | "edge";
  platform: "macOS" | "Windows" | "Linux" | "Android" | "iOS";
  browserVersion: string;
};

type WeightedViewport = { width: number; height: number; weight: number };

// ── UA Pool ──────────────────────────────────────────────────────

const UA_POOL: readonly WeightedUA[] = [
  // Desktop Chrome (~52)
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    weight: 8,
    browser: "chrome",
    platform: "macOS",
    browserVersion: "131",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    weight: 8,
    browser: "chrome",
    platform: "Windows",
    browserVersion: "131",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    weight: 3,
    browser: "chrome",
    platform: "Linux",
    browserVersion: "131",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    weight: 6,
    browser: "chrome",
    platform: "macOS",
    browserVersion: "130",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    weight: 6,
    browser: "chrome",
    platform: "Windows",
    browserVersion: "130",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    weight: 4,
    browser: "chrome",
    platform: "Windows",
    browserVersion: "129",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    weight: 4,
    browser: "chrome",
    platform: "macOS",
    browserVersion: "128",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    weight: 3,
    browser: "chrome",
    platform: "Windows",
    browserVersion: "127",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    weight: 3,
    browser: "chrome",
    platform: "macOS",
    browserVersion: "126",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    weight: 3,
    browser: "chrome",
    platform: "macOS",
    browserVersion: "125",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    weight: 2,
    browser: "chrome",
    platform: "Windows",
    browserVersion: "124",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    weight: 2,
    browser: "chrome",
    platform: "Linux",
    browserVersion: "124",
  },
  // Desktop Edge (~10)
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    weight: 5,
    browser: "edge",
    platform: "Windows",
    browserVersion: "131",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    weight: 3,
    browser: "edge",
    platform: "Windows",
    browserVersion: "130",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    weight: 2,
    browser: "edge",
    platform: "Windows",
    browserVersion: "129",
  },
  // Desktop Firefox (~15)
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
    weight: 4,
    browser: "firefox",
    platform: "macOS",
    browserVersion: "132",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    weight: 3,
    browser: "firefox",
    platform: "Windows",
    browserVersion: "132",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    weight: 2,
    browser: "firefox",
    platform: "Linux",
    browserVersion: "132",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    weight: 3,
    browser: "firefox",
    platform: "Windows",
    browserVersion: "131",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
    weight: 3,
    browser: "firefox",
    platform: "macOS",
    browserVersion: "130",
  },
  // Desktop Safari (~8)
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    weight: 5,
    browser: "safari",
    platform: "macOS",
    browserVersion: "17.6",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    weight: 3,
    browser: "safari",
    platform: "macOS",
    browserVersion: "17.5",
  },
  // Mobile (~15)
  {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    weight: 5,
    browser: "chrome",
    platform: "Android",
    browserVersion: "131",
  },
  {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    weight: 4,
    browser: "chrome",
    platform: "Android",
    browserVersion: "130",
  },
  {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    weight: 4,
    browser: "safari",
    platform: "iOS",
    browserVersion: "17.6",
  },
  {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    weight: 2,
    browser: "safari",
    platform: "iOS",
    browserVersion: "17.5",
  },
] as const;

// ── Viewport Pools ───────────────────────────────────────────────

const DESKTOP_VIEWPORTS: readonly WeightedViewport[] = [
  { width: 1920, height: 1080, weight: 40 },
  { width: 1440, height: 900, weight: 15 },
  { width: 1536, height: 864, weight: 15 },
  { width: 2560, height: 1440, weight: 10 },
  { width: 1366, height: 768, weight: 10 },
  { width: 1680, height: 1050, weight: 5 },
  { width: 1280, height: 720, weight: 5 },
] as const;

const MOBILE_VIEWPORTS: readonly WeightedViewport[] = [
  { width: 412, height: 915, weight: 60 },
  { width: 390, height: 844, weight: 40 },
] as const;

// ── Helpers ──────────────────────────────────────────────────────

const MOBILE_PLATFORMS = new Set<string>(["Android", "iOS"]);

function isMobilePlatform(platform: string): boolean {
  return MOBILE_PLATFORMS.has(platform);
}

/** Weighted random selection from an array of items with weight fields. */
function selectWeighted<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

/** Generate Sec-CH-UA header for Chromium-based browsers. */
function buildSecChUA(browser: "chrome" | "edge", version: string): string {
  const brand = browser === "edge" ? "Microsoft Edge" : "Google Chrome";
  return `"Chromium";v="${version}", "${brand}";v="${version}", "Not-A.Brand";v="99"`;
}

/** Pick an Accept-Language value tied to platform with minor variation. */
function pickAcceptLanguage(): string {
  const roll = Math.random();
  if (roll < 0.1) {
    return "en-GB,en;q=0.9";
  }
  if (roll < 0.2) {
    return "en-US,en;q=0.9,zh-CN;q=0.8";
  }
  return "en-US,en;q=0.9";
}

// ── Main Export ──────────────────────────────────────────────────

export type FingerprintOptions = {
  mobile?: boolean;
  preferBrowser?: "chrome" | "firefox" | "safari" | "edge";
};

/**
 * Create a consistent browser fingerprint by selecting a weighted UA
 * and deriving all identity fields from it.
 */
export function createBrowserFingerprint(opts?: FingerprintOptions): BrowserIdentity {
  let pool: readonly WeightedUA[] = UA_POOL;

  if (opts?.mobile !== undefined) {
    const wantMobile = opts.mobile;
    pool = pool.filter((entry) => isMobilePlatform(entry.platform) === wantMobile);
  }

  if (opts?.preferBrowser) {
    const browserFilter = opts.preferBrowser;
    const filtered = pool.filter((entry) => entry.browser === browserFilter);
    // Fall back to unfiltered pool if no matches (e.g. no mobile Edge entries)
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  const selected = selectWeighted(pool);
  const mobile = isMobilePlatform(selected.platform);
  const viewport = selectWeighted(mobile ? MOBILE_VIEWPORTS : DESKTOP_VIEWPORTS);

  const secChUA =
    selected.browser === "chrome" || selected.browser === "edge"
      ? buildSecChUA(selected.browser, selected.browserVersion)
      : null;

  return {
    userAgent: selected.ua,
    platform: selected.platform,
    browserFamily: selected.browser,
    browserVersion: selected.browserVersion,
    secChUA,
    acceptLanguage: pickAcceptLanguage(),
    viewport: { width: viewport.width, height: viewport.height },
  };
}
