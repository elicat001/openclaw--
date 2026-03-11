/**
 * Anti-replay guard for device tokens.
 *
 * Maintains a short-lived cache of recently used device tokens (keyed by
 * deviceId + role + token hash) to prevent token replay attacks.  Entries
 * expire after a configurable TTL (default 5 minutes) and are pruned lazily
 * on every `check` call.
 */

import { createHash } from "node:crypto";

/** Default TTL for used-token entries (5 minutes). */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Minimum interval between full prune sweeps (30 seconds). */
const PRUNE_INTERVAL_MS = 30_000;

type ReplayEntry = {
  /** Timestamp (ms) when the token was first seen. */
  usedAt: number;
};

export type DeviceTokenReplayGuard = {
  /**
   * Returns `true` if this exact token usage has been seen recently (replay).
   * If not a replay, records the usage and returns `false`.
   */
  check(deviceId: string, role: string, token: string): boolean;
  /** Number of entries currently tracked (mostly for tests / diagnostics). */
  size(): number;
  /** Remove all entries. */
  clear(): void;
};

function buildKey(deviceId: string, role: string, token: string): string {
  // Hash the token to avoid storing raw secrets in memory.
  const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `${deviceId}:${role}:${tokenHash}`;
}

export function createDeviceTokenReplayGuard(
  ttlMs: number = DEFAULT_TTL_MS,
): DeviceTokenReplayGuard {
  const entries = new Map<string, ReplayEntry>();
  let lastPruneAt = Date.now();

  function pruneExpired(): void {
    const now = Date.now();
    if (now - lastPruneAt < PRUNE_INTERVAL_MS) {
      return;
    }
    lastPruneAt = now;
    for (const [key, entry] of entries) {
      if (now - entry.usedAt > ttlMs) {
        entries.delete(key);
      }
    }
  }

  return {
    check(deviceId: string, role: string, token: string): boolean {
      pruneExpired();
      const key = buildKey(deviceId, role, token);
      const existing = entries.get(key);
      const now = Date.now();

      if (existing && now - existing.usedAt <= ttlMs) {
        // Token was already used within the TTL window — replay detected.
        return true;
      }

      // Record this usage.
      entries.set(key, { usedAt: now });
      return false;
    },

    size(): number {
      return entries.size;
    },

    clear(): void {
      entries.clear();
    },
  };
}

/**
 * Shared singleton replay guard instance.
 * Server code should use this unless testing with an isolated guard.
 */
let sharedGuard: DeviceTokenReplayGuard | null = null;

export function getSharedDeviceTokenReplayGuard(): DeviceTokenReplayGuard {
  if (!sharedGuard) {
    sharedGuard = createDeviceTokenReplayGuard();
  }
  return sharedGuard;
}

/** Reset the shared guard (for tests). */
export function resetSharedDeviceTokenReplayGuard(): void {
  sharedGuard?.clear();
  sharedGuard = null;
}
