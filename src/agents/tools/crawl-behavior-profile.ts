/**
 * Crawl behavior profiles — three presets that control how human-like
 * the scraping session behaves.
 *
 * Core principle: **look like a person, not a script.**
 *
 * Profiles:
 *   conservative — safest, for high-risk sites (Shopee, etc.)
 *   balanced     — efficiency vs. stability tradeoff
 *   aggressive   — fast, higher ban risk
 */

export type CrawlBehaviorProfile = {
  /** Human-readable profile name. */
  name: "conservative" | "balanced" | "aggressive";

  // ── Batch sizing (规则 1, 4) ──────────────────────────────────
  /** Items per batch before resting. */
  batchSize: number;
  /** Total max items per session before forced long cooldown. */
  maxItemsPerSession: number;

  // ── Page timing (规则 2, 8) ────────────────────────────────────
  /** Min seconds to "read" a page before acting. */
  pageReadMinSec: number;
  /** Max seconds to "read" a page. */
  pageReadMaxSec: number;
  /** Min seconds between page turns. */
  pageTurnMinSec: number;
  /** Max seconds between page turns. */
  pageTurnMaxSec: number;
  /** Probability (0-1) of an extra-long pause on a page. */
  longPauseProbability: number;
  /** Extra-long pause range [min, max] seconds. */
  longPauseRangeSec: [number, number];

  // ── Batch rest (规则 4) ────────────────────────────────────────
  /** Min seconds to rest between batches. */
  batchRestMinSec: number;
  /** Max seconds to rest between batches. */
  batchRestMaxSec: number;

  // ── Detail page simulation (规则 8) ────────────────────────────
  /** Probability of clicking into a detail page per item. */
  detailClickProbability: number;
  /** Min seconds spent on a detail page. */
  detailStayMinSec: number;
  /** Max seconds spent on a detail page. */
  detailStayMaxSec: number;

  // ── Anomaly handling (规则 9) ──────────────────────────────────
  /** Min seconds to pause when anomaly detected. */
  anomalyPauseMinSec: number;
  /** Max seconds to pause when anomaly detected. */
  anomalyPauseMaxSec: number;
  /** Max consecutive anomalies before aborting the session. */
  maxConsecutiveAnomalies: number;

  // ── Session discipline (规则 5, 6, 7, 10) ─────────────────────
  /** Only one keyword per session. */
  singleKeywordPerSession: boolean;
  /** Only one sort order per session. */
  fixedSortPerSession: boolean;
  /** Max page refreshes allowed per session. */
  maxRefreshesPerSession: number;
  /** Min seconds between any two consecutive actions. */
  minActionGapSec: number;
  /** Prefer scrolling/clicking over direct URL manipulation. */
  preferNaturalNavigation: boolean;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Presets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 保守版 — 最稳，适合高风控站（Shopee、Amazon 等）
 *   每次 10 条 · 每页 20~40 秒 · 每批休息 5~15 分钟
 */
export const CONSERVATIVE_PROFILE: CrawlBehaviorProfile = {
  name: "conservative",
  batchSize: 10,
  maxItemsPerSession: 100,
  pageReadMinSec: 20,
  pageReadMaxSec: 40,
  pageTurnMinSec: 20,
  pageTurnMaxSec: 40,
  longPauseProbability: 0.15,
  longPauseRangeSec: [45, 90],
  batchRestMinSec: 300, // 5 min
  batchRestMaxSec: 900, // 15 min
  detailClickProbability: 0.2,
  detailStayMinSec: 5,
  detailStayMaxSec: 15,
  anomalyPauseMinSec: 600, // 10 min
  anomalyPauseMaxSec: 1800, // 30 min
  maxConsecutiveAnomalies: 2,
  singleKeywordPerSession: true,
  fixedSortPerSession: true,
  maxRefreshesPerSession: 2,
  minActionGapSec: 3,
  preferNaturalNavigation: true,
};

/**
 * 折中版 — 效率和稳定性平衡
 *   每次 20 条 · 每页 15~30 秒 · 每批休息 3~10 分钟
 */
export const BALANCED_PROFILE: CrawlBehaviorProfile = {
  name: "balanced",
  batchSize: 20,
  maxItemsPerSession: 200,
  pageReadMinSec: 15,
  pageReadMaxSec: 30,
  pageTurnMinSec: 15,
  pageTurnMaxSec: 30,
  longPauseProbability: 0.1,
  longPauseRangeSec: [30, 60],
  batchRestMinSec: 180, // 3 min
  batchRestMaxSec: 600, // 10 min
  detailClickProbability: 0.1,
  detailStayMinSec: 3,
  detailStayMaxSec: 10,
  anomalyPauseMinSec: 300, // 5 min
  anomalyPauseMaxSec: 900, // 15 min
  maxConsecutiveAnomalies: 3,
  singleKeywordPerSession: true,
  fixedSortPerSession: true,
  maxRefreshesPerSession: 3,
  minActionGapSec: 2,
  preferNaturalNavigation: true,
};

/**
 * 激进版 — 快，但容易被拦
 *   每次 40 条 · 每页 8~15 秒 · 每批休息 1~3 分钟
 */
export const AGGRESSIVE_PROFILE: CrawlBehaviorProfile = {
  name: "aggressive",
  batchSize: 40,
  maxItemsPerSession: 500,
  pageReadMinSec: 8,
  pageReadMaxSec: 15,
  pageTurnMinSec: 8,
  pageTurnMaxSec: 18,
  longPauseProbability: 0.05,
  longPauseRangeSec: [20, 40],
  batchRestMinSec: 60, // 1 min
  batchRestMaxSec: 180, // 3 min
  detailClickProbability: 0.05,
  detailStayMinSec: 2,
  detailStayMaxSec: 6,
  anomalyPauseMinSec: 120, // 2 min
  anomalyPauseMaxSec: 600, // 10 min
  maxConsecutiveAnomalies: 5,
  singleKeywordPerSession: false,
  fixedSortPerSession: false,
  maxRefreshesPerSession: 5,
  minActionGapSec: 1,
  preferNaturalNavigation: false,
};

const PROFILES: Record<string, CrawlBehaviorProfile> = {
  conservative: CONSERVATIVE_PROFILE,
  balanced: BALANCED_PROFILE,
  aggressive: AGGRESSIVE_PROFILE,
};

/** Resolve a profile by name (default: balanced). */
export function resolveCrawlProfile(name?: string): CrawlBehaviorProfile {
  if (!name) {
    return BALANCED_PROFILE;
  }
  return PROFILES[name] ?? BALANCED_PROFILE;
}
