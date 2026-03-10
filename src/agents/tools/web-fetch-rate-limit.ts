/**
 * Per-domain rate limiting for web fetch requests.
 * Prevents triggering anti-bot rate limits by pacing requests per domain.
 */

import {
  createFixedWindowRateLimiter,
  type FixedWindowRateLimiter,
} from "../../infra/fixed-window-rate-limit.js";
import { sleep } from "../../utils.js";

const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_DOMAINS = 200;

type DomainEntry = {
  limiter: FixedWindowRateLimiter;
  lastUsedMs: number;
};

export type DomainRateLimiterConfig = {
  maxRequests?: number;
  windowMs?: number;
};

/**
 * Create a per-domain rate limiter that paces requests to avoid triggering anti-bot systems.
 * Domains are rate-limited independently. Stale entries are evicted when the map exceeds MAX_DOMAINS.
 */
export function createDomainRateLimiter(config?: DomainRateLimiterConfig) {
  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const domains = new Map<string, DomainEntry>();

  function evictStale(): void {
    if (domains.size <= MAX_DOMAINS) {
      return;
    }
    // Evict oldest-used entries until we're under the cap
    const entries = [...domains.entries()].toSorted((a, b) => a[1].lastUsedMs - b[1].lastUsedMs);
    const toEvict = entries.slice(0, domains.size - MAX_DOMAINS);
    for (const [key] of toEvict) {
      domains.delete(key);
    }
  }

  function getOrCreate(domain: string): DomainEntry {
    let entry = domains.get(domain);
    if (!entry) {
      evictStale();
      entry = {
        limiter: createFixedWindowRateLimiter({ maxRequests, windowMs }),
        lastUsedMs: Date.now(),
      };
      domains.set(domain, entry);
    }
    return entry;
  }

  return {
    /**
     * Wait until a rate-limit slot is available for the given domain.
     * If the current window is full, sleeps for the retryAfterMs duration.
     */
    async waitForSlot(domain: string): Promise<void> {
      const entry = getOrCreate(domain);
      entry.lastUsedMs = Date.now();
      const result = entry.limiter.consume();
      if (result.allowed) {
        return;
      }
      // Wait for the window to reset, then consume again
      if (result.retryAfterMs > 0) {
        await sleep(result.retryAfterMs);
      }
      // After waiting, consume (the window should have reset)
      entry.limiter.consume();
    },

    /** Get the number of tracked domains (for testing/monitoring). */
    get size(): number {
      return domains.size;
    },

    /** Reset all domain limiters (for testing). */
    reset(): void {
      domains.clear();
    },
  };
}

/** Extract the hostname from a URL for rate-limit keying. */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
