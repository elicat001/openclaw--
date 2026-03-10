/**
 * Crawl session manager.
 *
 * Enforces the "one account, one tab, one task" principle (规则 5):
 *   - Only one crawl session active at a time
 *   - Keyword locked per session (规则 1, 7)
 *   - Sort order locked per session (规则 7)
 *   - Tracks progress across batches
 *
 * Usage:
 * ```ts
 * const session = acquireCrawlSession({
 *   keyword: "livro infantil",
 *   sort: "sales",
 *   profile: "balanced",
 *   site: "shopee.com.br",
 * });
 * if (!session) {
 *   // another session is active
 * }
 * // ... do work ...
 * session.release();
 * ```
 */

import { logDebug } from "../../logger.js";
import { type CrawlBehaviorProfile, resolveCrawlProfile } from "./crawl-behavior-profile.js";
import { createCrawlPacer, type CrawlPacer } from "./crawl-pacing.js";

export type CrawlSessionConfig = {
  /** The search keyword for this session. */
  keyword: string;
  /** The sort order for this session (e.g., "sales", "price", "relevance"). */
  sort?: string;
  /** Behavior profile name or custom profile. */
  profile?: string | CrawlBehaviorProfile;
  /** Target site domain. */
  site?: string;
  /** Optional session label for logging. */
  label?: string;
};

export type CrawlSession = {
  /** Unique session ID. */
  id: string;
  /** The locked keyword (规则 1, 7). */
  keyword: string;
  /** The locked sort order (规则 7). */
  sort: string;
  /** Target site. */
  site: string;
  /** The pacer controlling timing. */
  pacer: CrawlPacer;
  /** The resolved behavior profile. */
  profile: CrawlBehaviorProfile;
  /** Session creation time. */
  startedAt: number;
  /** Whether this session is still active. */
  active: boolean;

  /**
   * 规则 1: Verify the action matches this session's keyword.
   * Returns false if trying to use a different keyword mid-session.
   */
  validateKeyword(keyword: string): boolean;

  /**
   * 规则 7: Verify the action matches this session's sort order.
   * Returns false if trying to change sort mid-session.
   */
  validateSort(sort: string): boolean;

  /** Release the session lock so a new session can start. */
  release(): void;

  /** Get session summary for logging. */
  summary(): CrawlSessionSummary;
};

export type CrawlSessionSummary = {
  id: string;
  keyword: string;
  sort: string;
  site: string;
  profile: string;
  itemsFetched: number;
  batchNumber: number;
  totalAnomalies: number;
  aborted: boolean;
  durationSec: number;
};

// ── Global session lock (规则 5) ────────────────────────────────

let activeSession: CrawlSession | null = null;

/** Check if a crawl session is currently active. */
export function hasActiveCrawlSession(): boolean {
  return activeSession !== null && activeSession.active;
}

/** Get the active session (if any). */
export function getActiveCrawlSession(): CrawlSession | null {
  return activeSession?.active ? activeSession : null;
}

let sessionCounter = 0;

/**
 * Acquire a new crawl session.
 * Returns null if another session is already active (规则 5).
 *
 * The session enforces:
 * - Single keyword (规则 1, 7)
 * - Single sort order (规则 7)
 * - Human-like pacing via the pacer
 */
export function acquireCrawlSession(config: CrawlSessionConfig): CrawlSession | null {
  // 规则 5: "一个账号、一个 tab、一个任务，最稳"
  if (hasActiveCrawlSession()) {
    logDebug(
      `[crawl-session] Cannot acquire: session "${activeSession!.id}" is still active ` +
        `(keyword: "${activeSession!.keyword}")`,
    );
    return null;
  }

  sessionCounter++;
  const id = `crawl-${sessionCounter}-${Date.now().toString(36)}`;
  const resolvedProfile =
    typeof config.profile === "string" || !config.profile
      ? resolveCrawlProfile(typeof config.profile === "string" ? config.profile : undefined)
      : config.profile;

  const pacer = createCrawlPacer(resolvedProfile);

  const session: CrawlSession = {
    id,
    keyword: config.keyword,
    sort: config.sort ?? "relevance",
    site: config.site ?? "unknown",
    profile: resolvedProfile,
    pacer,
    startedAt: Date.now(),
    active: true,

    validateKeyword(keyword: string): boolean {
      if (!resolvedProfile.singleKeywordPerSession) {
        return true;
      }
      if (keyword.toLowerCase() !== this.keyword.toLowerCase()) {
        logDebug(
          `[crawl-session] Keyword mismatch: session locked to "${this.keyword}", ` +
            `got "${keyword}". Change rejected (规则 1).`,
        );
        return false;
      }
      return true;
    },

    validateSort(sort: string): boolean {
      if (!resolvedProfile.fixedSortPerSession) {
        return true;
      }
      if (sort.toLowerCase() !== this.sort.toLowerCase()) {
        logDebug(
          `[crawl-session] Sort mismatch: session locked to "${this.sort}", ` +
            `got "${sort}". Change rejected (规则 7).`,
        );
        return false;
      }
      return true;
    },

    release(): void {
      if (!this.active) {
        return;
      }
      this.active = false;
      const durationSec = (Date.now() - this.startedAt) / 1000;
      const pacerState = this.pacer.getState();
      logDebug(
        `[crawl-session] Session "${this.id}" released after ${(durationSec / 60).toFixed(1)} min. ` +
          `Items: ${pacerState.itemsFetched}, Batches: ${pacerState.batchNumber}, ` +
          `Anomalies: ${pacerState.totalAnomalies}`,
      );
      if (activeSession === this) {
        activeSession = null;
      }
    },

    summary(): CrawlSessionSummary {
      const pacerState = this.pacer.getState();
      return {
        id: this.id,
        keyword: this.keyword,
        sort: this.sort,
        site: this.site,
        profile: resolvedProfile.name,
        itemsFetched: pacerState.itemsFetched,
        batchNumber: pacerState.batchNumber,
        totalAnomalies: pacerState.totalAnomalies,
        aborted: pacerState.aborted,
        durationSec: (Date.now() - this.startedAt) / 1000,
      };
    },
  };

  activeSession = session;
  logDebug(
    `[crawl-session] Session "${id}" started — keyword: "${config.keyword}", ` +
      `sort: "${session.sort}", profile: ${resolvedProfile.name}, site: ${session.site}`,
  );

  return session;
}

/**
 * Force-release the active session (use only for cleanup/recovery).
 * Prefer calling session.release() on the session object.
 */
export function forceReleaseCrawlSession(): void {
  if (activeSession) {
    activeSession.release();
  }
}
