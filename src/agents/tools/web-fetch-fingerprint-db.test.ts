import { describe, expect, test } from "vitest";
import { createBrowserFingerprint } from "./web-fetch-fingerprint-db.js";
import type { ExtendedBrowserIdentity } from "./web-fetch-fingerprint-db.js";

const KNOWN_DESKTOP_WIDTHS = new Set([1920, 1440, 1536, 2560, 1366, 1680, 1280]);
const KNOWN_MOBILE_WIDTHS = new Set([412, 390]);

describe("createBrowserFingerprint", () => {
  test("returns valid BrowserIdentity with all fields", () => {
    const id = createBrowserFingerprint();
    expect(id.userAgent).toContain("Mozilla/5.0");
    expect(typeof id.platform).toBe("string");
    expect(typeof id.browserFamily).toBe("string");
    expect(typeof id.browserVersion).toBe("string");
    expect(typeof id.acceptLanguage).toBe("string");
    expect(id.acceptLanguage).toContain("en");
    expect(id.viewport).toHaveProperty("width");
    expect(id.viewport).toHaveProperty("height");
    expect(id.viewport.width).toBeGreaterThan(0);
    expect(id.viewport.height).toBeGreaterThan(0);
  });

  test("Chrome UAs get Sec-CH-UA with Google Chrome brand", () => {
    for (let i = 0; i < 50; i++) {
      const id = createBrowserFingerprint({ preferBrowser: "chrome" });
      expect(id.secChUA).not.toBeNull();
      expect(id.secChUA).toContain("Google Chrome");
      expect(id.secChUA).toContain("Chromium");
    }
  });

  test("Firefox UAs do not get Sec-CH-UA", () => {
    for (let i = 0; i < 20; i++) {
      const id = createBrowserFingerprint({ preferBrowser: "firefox" });
      expect(id.secChUA).toBeNull();
      expect(id.browserFamily).toBe("firefox");
    }
  });

  test("Safari UAs do not get Sec-CH-UA", () => {
    for (let i = 0; i < 20; i++) {
      const id = createBrowserFingerprint({ preferBrowser: "safari", mobile: false });
      expect(id.secChUA).toBeNull();
      expect(id.browserFamily).toBe("safari");
    }
  });

  test("Edge UAs get Edge-specific Sec-CH-UA", () => {
    for (let i = 0; i < 20; i++) {
      const id = createBrowserFingerprint({ preferBrowser: "edge" });
      expect(id.secChUA).not.toBeNull();
      expect(id.secChUA).toContain("Microsoft Edge");
      expect(id.secChUA).toContain("Chromium");
      expect(id.secChUA).not.toContain("Google Chrome");
    }
  });

  test("mobile option returns mobile viewport and mobile UA", () => {
    for (let i = 0; i < 30; i++) {
      const id = createBrowserFingerprint({ mobile: true });
      expect(KNOWN_MOBILE_WIDTHS.has(id.viewport.width)).toBe(true);
      // Extended identity has Android/iOS platform
      const ext = id as unknown as ExtendedBrowserIdentity;
      expect(["Android", "iOS"]).toContain(ext.platform);
      expect(id.userAgent).toMatch(/Mobile|iPhone/);
    }
  });

  test("desktop option returns desktop viewport", () => {
    for (let i = 0; i < 30; i++) {
      const id = createBrowserFingerprint({ mobile: false });
      expect(KNOWN_DESKTOP_WIDTHS.has(id.viewport.width)).toBe(true);
    }
  });

  test("preferBrowser filters correctly", () => {
    for (let i = 0; i < 30; i++) {
      const id = createBrowserFingerprint({ preferBrowser: "firefox" });
      expect(id.browserFamily).toBe("firefox");
      expect(id.userAgent).toContain("Firefox");
    }
  });

  test("weight distribution: Chrome should be >40% over 1000 samples", () => {
    let chromeCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      const id = createBrowserFingerprint();
      if (id.browserFamily === "chrome") {
        chromeCount++;
      }
    }
    // Chrome has ~52/100 weight, so should be well above 40%
    expect(chromeCount / total).toBeGreaterThan(0.4);
  });

  test("viewport is within known pool", () => {
    const allWidths = new Set([...KNOWN_DESKTOP_WIDTHS, ...KNOWN_MOBILE_WIDTHS]);
    for (let i = 0; i < 50; i++) {
      const id = createBrowserFingerprint();
      expect(allWidths.has(id.viewport.width)).toBe(true);
    }
  });

  test("accept-language is always a valid English locale string", () => {
    const validLangs = new Set(["en-US,en;q=0.9", "en-GB,en;q=0.9", "en-US,en;q=0.9,zh-CN;q=0.8"]);
    for (let i = 0; i < 50; i++) {
      const id = createBrowserFingerprint();
      expect(validLangs.has(id.acceptLanguage)).toBe(true);
    }
  });
});
