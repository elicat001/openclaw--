import { describe, expect, test } from "vitest";
import {
  AGGRESSIVE_PROFILE,
  BALANCED_PROFILE,
  CONSERVATIVE_PROFILE,
  resolveCrawlProfile,
} from "./crawl-behavior-profile.js";

describe("CrawlBehaviorProfile presets", () => {
  test("conservative profile has smallest batch size", () => {
    expect(CONSERVATIVE_PROFILE.batchSize).toBe(10);
    expect(CONSERVATIVE_PROFILE.name).toBe("conservative");
  });

  test("balanced profile has medium batch size", () => {
    expect(BALANCED_PROFILE.batchSize).toBe(20);
    expect(BALANCED_PROFILE.name).toBe("balanced");
  });

  test("aggressive profile has largest batch size", () => {
    expect(AGGRESSIVE_PROFILE.batchSize).toBe(40);
    expect(AGGRESSIVE_PROFILE.name).toBe("aggressive");
  });

  test("conservative has longer delays than aggressive", () => {
    expect(CONSERVATIVE_PROFILE.pageTurnMinSec).toBeGreaterThan(AGGRESSIVE_PROFILE.pageTurnMinSec);
    expect(CONSERVATIVE_PROFILE.batchRestMinSec).toBeGreaterThan(
      AGGRESSIVE_PROFILE.batchRestMinSec,
    );
    expect(CONSERVATIVE_PROFILE.anomalyPauseMinSec).toBeGreaterThan(
      AGGRESSIVE_PROFILE.anomalyPauseMinSec,
    );
  });

  test("conservative enforces single keyword and sort", () => {
    expect(CONSERVATIVE_PROFILE.singleKeywordPerSession).toBe(true);
    expect(CONSERVATIVE_PROFILE.fixedSortPerSession).toBe(true);
  });

  test("aggressive allows multiple keywords", () => {
    expect(AGGRESSIVE_PROFILE.singleKeywordPerSession).toBe(false);
  });
});

describe("resolveCrawlProfile", () => {
  test("returns balanced by default", () => {
    expect(resolveCrawlProfile().name).toBe("balanced");
    expect(resolveCrawlProfile(undefined).name).toBe("balanced");
  });

  test("resolves by name", () => {
    expect(resolveCrawlProfile("conservative").name).toBe("conservative");
    expect(resolveCrawlProfile("aggressive").name).toBe("aggressive");
  });

  test("falls back to balanced for unknown name", () => {
    expect(resolveCrawlProfile("unknown").name).toBe("balanced");
  });
});
