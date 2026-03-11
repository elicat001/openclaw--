/**
 * Crawl behavior engine — generates realistic human-like interaction data
 * for browser automation (mouse paths, scroll sequences, reading times,
 * warmup navigation chains).
 *
 * All functions are pure (side-effect-free) and deterministic given the
 * same random seed, making them easy to test and replay.
 */

import type { CrawlBehaviorProfile } from "./crawl-behavior-profile.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Point = { x: number; y: number };

export type ScrollStep = {
  /** Pixels to scroll (positive = down, negative = up). */
  deltaY: number;
  /** Milliseconds to wait after this scroll. */
  delayMs: number;
};

export type WarmupStep = {
  /** URL to visit. */
  url: string;
  /** How long to stay on this page (ms). */
  dwellMs: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Box-Muller transform — returns a normally-distributed random number.
 */
function gaussianRandom(mean = 0, stddev = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mouse path generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a human-like mouse path between two points using cubic Bezier
 * curves. Includes Gaussian jitter and variable speed.
 */
export function generateMousePath(from: Point, to: Point, steps?: number): Point[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const numSteps = steps ?? Math.max(10, Math.round(distance / 15));

  // Two random control points offset from the straight line
  const cp1 = {
    x: from.x + (to.x - from.x) * 0.25 + gaussianRandom() * distance * 0.15,
    y: from.y + (to.y - from.y) * 0.25 + gaussianRandom() * distance * 0.15,
  };
  const cp2 = {
    x: from.x + (to.x - from.x) * 0.75 + gaussianRandom() * distance * 0.15,
    y: from.y + (to.y - from.y) * 0.75 + gaussianRandom() * distance * 0.15,
  };

  const path: Point[] = [];
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    // Cubic Bezier formula
    const x =
      (1 - t) ** 3 * from.x +
      3 * (1 - t) ** 2 * t * cp1.x +
      3 * (1 - t) * t ** 2 * cp2.x +
      t ** 3 * to.x;
    const y =
      (1 - t) ** 3 * from.y +
      3 * (1 - t) ** 2 * t * cp1.y +
      3 * (1 - t) * t ** 2 * cp2.y +
      t ** 3 * to.y;
    // Small jitter that decreases near endpoints for click precision
    const jitterScale = Math.sin(t * Math.PI) * 2;
    path.push({
      x: Math.round(x + gaussianRandom() * jitterScale),
      y: Math.round(y + gaussianRandom() * jitterScale),
    });
  }
  return path;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scroll sequence generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a non-uniform scroll sequence to cover a page.
 * Includes variable speeds, occasional pauses, and rare scroll-ups.
 */
export function generateScrollSequence(pageHeight: number, viewportHeight: number): ScrollStep[] {
  const steps: ScrollStep[] = [];
  let position = 0;
  const target = pageHeight - viewportHeight;

  while (position < target) {
    // Variable scroll distance (200-600px)
    const baseScroll = 200 + Math.random() * 400;

    // 5% chance of scrolling up (re-reading)
    if (Math.random() < 0.05 && position > 300) {
      const scrollUp = -(100 + Math.random() * 200);
      steps.push({
        deltaY: Math.round(scrollUp),
        delayMs: 300 + Math.random() * 500,
      });
      position += scrollUp;
      continue;
    }

    const scroll = Math.min(baseScroll, target - position);
    position += scroll;

    // Variable delay
    let delay: number;
    if (Math.random() < 0.1) {
      // 10% chance of long pause (reading something interesting)
      delay = 1000 + Math.random() * 3000;
    } else {
      delay = 100 + Math.random() * 700;
    }

    steps.push({
      deltaY: Math.round(scroll),
      delayMs: Math.round(delay),
    });
  }

  return steps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reading time calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calculate human-like reading time based on content length and behavior
 * profile. Returns milliseconds.
 */
export function calculateReadingTime(contentLength: number, profile: CrawlBehaviorProfile): number {
  // Estimate word count (~5 chars per word average)
  const words = contentLength / 5;

  // WPM derived from profile timing
  const minWPM = profile.pageReadMinSec > 0 ? 200 / (profile.pageReadMinSec / 60) : 180;
  const maxWPM = profile.pageReadMaxSec > 0 ? 200 / (profile.pageReadMaxSec / 60) : 400;
  const wpm = minWPM + Math.random() * (maxWPM - minWPM);

  // Base reading time
  const baseMs = (words / wpm) * 60 * 1000;

  // Clamp to profile range
  const minMs = profile.pageReadMinSec * 1000;
  const maxMs = profile.pageReadMaxSec * 1000;

  // Add jitter (+/-15%)
  const jitter = 1 + gaussianRandom(0, 0.15);

  return Math.round(Math.max(minMs, Math.min(maxMs * 1.5, baseMs * jitter)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Warmup chain generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build a navigation warmup chain for a target URL.
 * Simulates a user browsing from homepage to the target page.
 */
export function buildWarmupChain(targetUrl: string, _site: string): WarmupStep[] {
  let origin: string;
  try {
    const u = new URL(targetUrl);
    origin = u.origin;
  } catch {
    return [];
  }

  const steps: WarmupStep[] = [];

  // Step 1: Homepage
  steps.push({
    url: `${origin}/`,
    dwellMs: 3000 + Math.random() * 5000,
  });

  // Step 2: Try to infer a category/search page from URL path
  try {
    const u = new URL(targetUrl);
    const pathParts = u.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      // Visit first path segment as category
      steps.push({
        url: `${origin}/${pathParts[0]}/`,
        dwellMs: 2000 + Math.random() * 4000,
      });
    }
  } catch {
    /* skip */
  }

  // Don't add target itself — caller will fetch it
  return steps;
}
