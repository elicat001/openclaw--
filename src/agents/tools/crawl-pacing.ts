/**
 * Human-like pacing engine for crawl sessions.
 *
 * Core principle: **像人，不像脚本**
 *
 * Implements:
 *   - Randomized delays between actions (not uniform intervals)
 *   - Page "reading" simulation before next action
 *   - Occasional long pauses (like a real person getting distracted)
 *   - Batch rest periods (take a break after N items)
 *   - Anomaly-triggered cooldowns
 *   - Anti-pattern detection (prevents repetitive action sequences)
 */

import { logDebug } from "../../logger.js";
import { sleep } from "../../utils.js";
import { detectAnomaly, shouldAbortSession, type AnomalyDetectionResult } from "./crawl-anomaly.js";
import type { CrawlBehaviorProfile } from "./crawl-behavior-profile.js";

// ── Random helpers ──────────────────────────────────────────────

/** Random float in [min, max]. */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random integer in [min, max]. */
function _randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

/** Add Gaussian-ish jitter to a base value (mean = base, stddev ~= base*0.2). */
function jitter(base: number, factor = 0.2): number {
  const offset = (Math.random() + Math.random() - 1) * factor;
  return Math.max(0, base * (1 + offset));
}

// ── Action types for anti-pattern detection (规则 10) ───────────

type ActionType = "search" | "page_turn" | "scroll" | "detail_click" | "refresh" | "other";

// ── Crawl Pacer ─────────────────────────────────────────────────

export type CrawlPacerState = {
  /** Total items fetched in this session. */
  itemsFetched: number;
  /** Items fetched in current batch. */
  batchItemsFetched: number;
  /** Current batch number (1-based). */
  batchNumber: number;
  /** Consecutive anomalies detected. */
  consecutiveAnomalies: number;
  /** Total anomalies detected. */
  totalAnomalies: number;
  /** Number of refreshes performed. */
  refreshCount: number;
  /** Whether session is paused due to anomaly. */
  paused: boolean;
  /** Whether session has been aborted. */
  aborted: boolean;
  /** Recent action sequence for anti-pattern detection. */
  recentActions: ActionType[];
  /** Timestamp of last action. */
  lastActionMs: number;
};

export type CrawlPacerEvents = {
  onPageRead?: (durationSec: number) => void;
  onPageTurn?: (delaySec: number) => void;
  onBatchRest?: (durationSec: number, batchNumber: number) => void;
  onAnomaly?: (result: AnomalyDetectionResult) => void;
  onAnomalyPause?: (durationSec: number) => void;
  onAbort?: (reason: string) => void;
  onDetailClick?: (durationSec: number) => void;
};

/**
 * Create a pacing engine that enforces human-like crawl behavior.
 *
 * Usage:
 * ```ts
 * const pacer = createCrawlPacer(profile);
 * for (const page of pages) {
 *   await pacer.beforePageTurn();         // waits like a human
 *   const result = await fetchPage(page);
 *   await pacer.afterPageLoad(result);    // checks for anomalies
 *   await pacer.simulateReading();        // simulates reading time
 *   await pacer.maybeClickDetail();       // occasionally visits detail
 *   pacer.recordItems(itemCount);         // tracks batch progress
 *   if (pacer.shouldRestBatch()) {
 *     await pacer.batchRest();            // takes a break
 *   }
 * }
 * ```
 */
export function createCrawlPacer(profile: CrawlBehaviorProfile, events?: CrawlPacerEvents) {
  const state: CrawlPacerState = {
    itemsFetched: 0,
    batchItemsFetched: 0,
    batchNumber: 1,
    consecutiveAnomalies: 0,
    totalAnomalies: 0,
    refreshCount: 0,
    paused: false,
    aborted: false,
    recentActions: [],
    lastActionMs: Date.now(),
  };

  function recordAction(action: ActionType): void {
    state.recentActions.push(action);
    // Keep only last 20 actions
    if (state.recentActions.length > 20) {
      state.recentActions.shift();
    }
    state.lastActionMs = Date.now();
  }

  /**
   * 规则 10: Detect if recent actions form a repetitive bot-like pattern.
   * e.g., search-page_turn-search-page_turn-search
   */
  function detectRepetitivePattern(): boolean {
    const actions = state.recentActions;
    if (actions.length < 6) {
      return false;
    }

    const last6 = actions.slice(-6);
    // Check if it's alternating between 2 actions
    const pattern = `${last6[0]},${last6[1]}`;
    const isAlternating =
      `${last6[2]},${last6[3]}` === pattern && `${last6[4]},${last6[5]}` === pattern;

    return isAlternating;
  }

  /** Enforce minimum gap between actions (规则 10). */
  async function enforceMinGap(): Promise<void> {
    const elapsed = Date.now() - state.lastActionMs;
    const minGapMs = profile.minActionGapSec * 1000;
    if (elapsed < minGapMs) {
      await sleep(minGapMs - elapsed);
    }
  }

  return {
    /** Get current pacer state (read-only snapshot). */
    getState(): Readonly<CrawlPacerState> {
      return { ...state };
    },

    /** Whether the session has been aborted. */
    isAborted(): boolean {
      return state.aborted;
    },

    /**
     * 规则 2, 8: Simulate reading a page before taking next action.
     * Waits a randomized duration within the profile's reading range.
     */
    async simulateReading(): Promise<void> {
      if (state.aborted) {
        return;
      }

      let durationSec = randRange(profile.pageReadMinSec, profile.pageReadMaxSec);

      // Occasional long pause (like getting distracted)
      if (Math.random() < profile.longPauseProbability) {
        const [longMin, longMax] = profile.longPauseRangeSec;
        durationSec = randRange(longMin, longMax);
      }

      durationSec = jitter(durationSec);
      logDebug(`[crawl-pacing] simulating ${durationSec.toFixed(1)}s page reading`);
      events?.onPageRead?.(durationSec);
      await sleep(durationSec * 1000);
      recordAction("scroll");
    },

    /**
     * 规则 2: Wait before turning to the next page.
     * Adds randomized delay, respects min action gap, detects patterns.
     */
    async beforePageTurn(): Promise<void> {
      if (state.aborted) {
        return;
      }

      await enforceMinGap();

      // If repetitive pattern detected, add extra delay (规则 10)
      if (detectRepetitivePattern()) {
        const extraSec = randRange(10, 30);
        logDebug(`[crawl-pacing] repetitive pattern detected, extra ${extraSec.toFixed(0)}s delay`);
        await sleep(extraSec * 1000);
      }

      let delaySec = randRange(profile.pageTurnMinSec, profile.pageTurnMaxSec);
      delaySec = jitter(delaySec);

      logDebug(`[crawl-pacing] page turn delay: ${delaySec.toFixed(1)}s`);
      events?.onPageTurn?.(delaySec);
      await sleep(delaySec * 1000);
      recordAction("page_turn");
    },

    /**
     * 规则 8: Optionally click into a detail page to look more human.
     * Returns true if a detail click was simulated.
     */
    async maybeClickDetail(): Promise<boolean> {
      if (state.aborted) {
        return false;
      }
      if (Math.random() > profile.detailClickProbability) {
        return false;
      }

      const staySec = randRange(profile.detailStayMinSec, profile.detailStayMaxSec);
      logDebug(`[crawl-pacing] simulating detail page visit: ${staySec.toFixed(1)}s`);
      events?.onDetailClick?.(staySec);
      await sleep(staySec * 1000);
      recordAction("detail_click");
      return true;
    },

    /** Record items fetched and advance batch counter. */
    recordItems(count: number): void {
      state.itemsFetched += count;
      state.batchItemsFetched += count;
    },

    /** 规则 4: Check if current batch is complete and needs rest. */
    shouldRestBatch(): boolean {
      return state.batchItemsFetched >= profile.batchSize;
    },

    /** Check if session has reached max items. */
    hasReachedSessionLimit(): boolean {
      return state.itemsFetched >= profile.maxItemsPerSession;
    },

    /**
     * 规则 4: Take a batch rest. Resets batch counter.
     * "100 条最好拆成 5 批 x 20"
     */
    async batchRest(): Promise<void> {
      if (state.aborted) {
        return;
      }

      const durationSec = randRange(profile.batchRestMinSec, profile.batchRestMaxSec);
      logDebug(
        `[crawl-pacing] batch ${state.batchNumber} complete (${state.batchItemsFetched} items), ` +
          `resting ${(durationSec / 60).toFixed(1)} minutes`,
      );
      events?.onBatchRest?.(durationSec, state.batchNumber);

      await sleep(durationSec * 1000);

      state.batchItemsFetched = 0;
      state.batchNumber++;
    },

    /**
     * 规则 9: Check page response for anomalies.
     * If detected, pauses automatically.
     * Returns the anomaly result.
     */
    async afterPageLoad(params: {
      status: number;
      body: string;
      loadTimeMs?: number;
      url?: string;
    }): Promise<AnomalyDetectionResult> {
      const result = detectAnomaly(params);

      if (!result.detected) {
        state.consecutiveAnomalies = 0;
        return result;
      }

      state.consecutiveAnomalies++;
      state.totalAnomalies++;
      events?.onAnomaly?.(result);

      logDebug(
        `[crawl-pacing] anomaly detected: ${result.type} (${result.severity}), ` +
          `consecutive: ${state.consecutiveAnomalies}`,
      );

      // Check if we should abort
      if (
        shouldAbortSession({
          consecutiveAnomalies: state.consecutiveAnomalies,
          maxConsecutive: profile.maxConsecutiveAnomalies,
          lastSeverity: result.severity,
        })
      ) {
        state.aborted = true;
        const reason = `Too many anomalies (${state.consecutiveAnomalies} consecutive): ${result.reason}`;
        logDebug(`[crawl-pacing] session aborted: ${reason}`);
        events?.onAbort?.(reason);
        return result;
      }

      // Pause (规则 9: "停 5 到 15 分钟，再继续")
      const pauseSec = randRange(profile.anomalyPauseMinSec, profile.anomalyPauseMaxSec);
      state.paused = true;
      logDebug(`[crawl-pacing] anomaly pause: ${(pauseSec / 60).toFixed(1)} minutes`);
      events?.onAnomalyPause?.(pauseSec);
      await sleep(pauseSec * 1000);
      state.paused = false;

      return result;
    },

    /**
     * 规则 6: Check if a refresh is allowed.
     * Returns false if max refreshes exceeded.
     */
    canRefresh(): boolean {
      return state.refreshCount < profile.maxRefreshesPerSession;
    },

    /** Record a page refresh. */
    recordRefresh(): void {
      state.refreshCount++;
      recordAction("refresh");
    },

    /** Record a search action. */
    recordSearch(): void {
      recordAction("search");
    },

    /** Get the profile being used. */
    getProfile(): CrawlBehaviorProfile {
      return profile;
    },
  };
}

export type CrawlPacer = ReturnType<typeof createCrawlPacer>;
