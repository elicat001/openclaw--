import { describe, expect, test } from "vitest";
import {
  buildWarmupChain,
  calculateReadingTime,
  generateMousePath,
  generateScrollSequence,
} from "./crawl-behavior-engine.js";
import { BALANCED_PROFILE, CONSERVATIVE_PROFILE } from "./crawl-behavior-profile.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateMousePath
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateMousePath", () => {
  const from = { x: 100, y: 200 };
  const to = { x: 500, y: 600 };

  test("returns array of points starting at from", () => {
    const path = generateMousePath(from, to);
    expect(path.length).toBeGreaterThanOrEqual(10);
    // First point should be very close to `from` (small jitter allowed)
    expect(Math.abs(path[0].x - from.x)).toBeLessThanOrEqual(5);
    expect(Math.abs(path[0].y - from.y)).toBeLessThanOrEqual(5);
  });

  test("ends near the target point", () => {
    const path = generateMousePath(from, to);
    const last = path[path.length - 1];
    // Jitter is minimal near endpoints
    expect(Math.abs(last.x - to.x)).toBeLessThanOrEqual(5);
    expect(Math.abs(last.y - to.y)).toBeLessThanOrEqual(5);
  });

  test("path length matches explicit steps parameter", () => {
    const path = generateMousePath(from, to, 25);
    // steps + 1 points (inclusive of start and end)
    expect(path.length).toBe(26);
  });

  test("no teleporting — adjacent points are close together", () => {
    const path = generateMousePath(from, to, 30);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const maxJump = distance / 3; // generous upper bound
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      const step = Math.hypot(dx, dy);
      expect(step).toBeLessThan(maxJump);
    }
  });

  test("produces smooth path (Gaussian jitter via Bezier curve)", () => {
    // Run multiple times; average midpoint should be roughly between from and to
    const midpoints: { x: number; y: number }[] = [];
    for (let i = 0; i < 50; i++) {
      const path = generateMousePath(from, to, 20);
      midpoints.push(path[10]);
    }
    const avgX = midpoints.reduce((s, p) => s + p.x, 0) / midpoints.length;
    const avgY = midpoints.reduce((s, p) => s + p.y, 0) / midpoints.length;
    // Average midpoint should be roughly at the center
    const expectedMidX = (from.x + to.x) / 2;
    const expectedMidY = (from.y + to.y) / 2;
    expect(Math.abs(avgX - expectedMidX)).toBeLessThan(100);
    expect(Math.abs(avgY - expectedMidY)).toBeLessThan(100);
  });

  test("handles zero-distance path (same start and end)", () => {
    const p = { x: 300, y: 300 };
    const path = generateMousePath(p, p);
    expect(path.length).toBeGreaterThanOrEqual(10);
    // All points should be very close to origin
    for (const pt of path) {
      expect(Math.abs(pt.x - p.x)).toBeLessThan(10);
      expect(Math.abs(pt.y - p.y)).toBeLessThan(10);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateScrollSequence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateScrollSequence", () => {
  test("covers the page height", () => {
    const steps = generateScrollSequence(5000, 800);
    const totalScroll = steps.reduce((sum, s) => sum + s.deltaY, 0);
    // Should have scrolled enough to reach the bottom (accounting for scroll-ups)
    expect(totalScroll).toBeGreaterThanOrEqual(5000 - 800 - 300);
  });

  test("all steps have valid deltaY and delayMs", () => {
    const steps = generateScrollSequence(3000, 600);
    for (const step of steps) {
      expect(Number.isFinite(step.deltaY)).toBe(true);
      expect(Number.isFinite(step.delayMs)).toBe(true);
      expect(step.delayMs).toBeGreaterThan(0);
    }
  });

  test("has variation in delays (not all the same)", () => {
    const steps = generateScrollSequence(8000, 800);
    const delays = steps.map((s) => s.delayMs);
    const unique = new Set(delays);
    // With randomness, we expect multiple distinct delay values
    expect(unique.size).toBeGreaterThan(1);
  });

  test("includes some scroll-down steps", () => {
    const steps = generateScrollSequence(5000, 800);
    const downSteps = steps.filter((s) => s.deltaY > 0);
    expect(downSteps.length).toBeGreaterThan(0);
  });

  test("returns empty for page shorter than viewport", () => {
    const steps = generateScrollSequence(600, 800);
    expect(steps.length).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// calculateReadingTime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("calculateReadingTime", () => {
  test("returns within a reasonable range", () => {
    const time = calculateReadingTime(5000, BALANCED_PROFILE);
    // Should be at least minMs
    expect(time).toBeGreaterThanOrEqual(BALANCED_PROFILE.pageReadMinSec * 1000);
    // Should not exceed maxMs * 1.5 (the upper clamp)
    expect(time).toBeLessThanOrEqual(BALANCED_PROFILE.pageReadMaxSec * 1000 * 1.5);
  });

  test("longer content produces longer reading time on average", () => {
    const shortTimes: number[] = [];
    const longTimes: number[] = [];
    for (let i = 0; i < 100; i++) {
      shortTimes.push(calculateReadingTime(100, CONSERVATIVE_PROFILE));
      longTimes.push(calculateReadingTime(10000, CONSERVATIVE_PROFILE));
    }
    const avgShort = shortTimes.reduce((a, b) => a + b, 0) / shortTimes.length;
    const avgLong = longTimes.reduce((a, b) => a + b, 0) / longTimes.length;
    expect(avgLong).toBeGreaterThan(avgShort);
  });

  test("respects profile minimum", () => {
    // Very short content should still meet minimum
    for (let i = 0; i < 20; i++) {
      const time = calculateReadingTime(10, BALANCED_PROFILE);
      expect(time).toBeGreaterThanOrEqual(BALANCED_PROFILE.pageReadMinSec * 1000);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildWarmupChain
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildWarmupChain", () => {
  test("returns homepage step", () => {
    const chain = buildWarmupChain("https://example.com/shop/item/42", "example");
    expect(chain.length).toBeGreaterThanOrEqual(1);
    expect(chain[0].url).toBe("https://example.com/");
    expect(chain[0].dwellMs).toBeGreaterThan(0);
  });

  test("handles deep URLs with category step", () => {
    const chain = buildWarmupChain("https://shop.io/electronics/phones/123", "shop");
    // Should have homepage + category
    expect(chain.length).toBe(2);
    expect(chain[0].url).toBe("https://shop.io/");
    expect(chain[1].url).toBe("https://shop.io/electronics/");
  });

  test("single path segment produces only homepage", () => {
    const chain = buildWarmupChain("https://example.com/page", "example");
    expect(chain.length).toBe(1);
    expect(chain[0].url).toBe("https://example.com/");
  });

  test("returns empty array for invalid URL", () => {
    const chain = buildWarmupChain("not-a-url", "x");
    expect(chain).toEqual([]);
  });

  test("dwell times are positive and reasonable", () => {
    const chain = buildWarmupChain("https://a.com/b/c/d", "a");
    for (const step of chain) {
      expect(step.dwellMs).toBeGreaterThanOrEqual(2000);
      expect(step.dwellMs).toBeLessThanOrEqual(10000);
    }
  });
});
