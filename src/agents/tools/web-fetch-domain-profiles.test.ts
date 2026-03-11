import { describe, expect, test } from "vitest";
import {
  matchDomainProfile,
  registerDomainProfile,
  resolveStartStrategy,
} from "./web-fetch-domain-profiles.js";

describe("matchDomainProfile", () => {
  test("matches shopee domains", () => {
    const profile = matchDomainProfile("shopee.com.br");
    expect(profile).not.toBeNull();
    expect(profile!.defaultMode).toBe("scrapling_stealth");
    expect(profile!.crawlProfile).toBe("conservative");
    expect(profile!.warmupPath).toBe("/");
  });

  test("matches shopee subdomains", () => {
    const profile = matchDomainProfile("mall.shopee.com.br");
    expect(profile).not.toBeNull();
    expect(profile!.defaultMode).toBe("scrapling_stealth");
  });

  test("matches amazon domains", () => {
    expect(matchDomainProfile("amazon.com")).not.toBeNull();
    expect(matchDomainProfile("amazon.co.jp")).not.toBeNull();
  });

  test("matches lazada domains", () => {
    expect(matchDomainProfile("lazada.com")).not.toBeNull();
    expect(matchDomainProfile("lazada.co.th")).not.toBeNull();
  });

  test("returns null for unknown domains", () => {
    expect(matchDomainProfile("example.com")).toBeNull();
    expect(matchDomainProfile("github.com")).toBeNull();
  });
});

describe("resolveStartStrategy", () => {
  test("returns stealth for known anti-bot domains", () => {
    expect(resolveStartStrategy("shopee.com.br")).toBe("scrapling_stealth");
    expect(resolveStartStrategy("amazon.com")).toBe("scrapling_stealth");
  });

  test("returns direct for unknown domains", () => {
    expect(resolveStartStrategy("example.com")).toBe("direct");
  });
});

describe("registerDomainProfile", () => {
  test("custom profiles take priority", () => {
    registerDomainProfile({
      patterns: ["custom-shop.com"],
      defaultMode: "scrapling_fast",
      crawlProfile: "aggressive",
      warmupPath: null,
      requiresCookies: false,
    });

    const profile = matchDomainProfile("custom-shop.com");
    expect(profile).not.toBeNull();
    expect(profile!.defaultMode).toBe("scrapling_fast");
    expect(profile!.crawlProfile).toBe("aggressive");
  });
});
