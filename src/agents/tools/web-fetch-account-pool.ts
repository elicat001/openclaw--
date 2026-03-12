/**
 * Account pool for managing login credentials across anti-bot platforms.
 * Loads from ~/.openclaw/accounts.json, supports LRU rotation,
 * health tracking, and per-account proxy binding.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logDebug } from "../../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountCredential = {
  id: string;
  platform: string;
  email?: string;
  phone?: string;
  password: string;
  region: string;
  /** Dedicated proxy URL for this account. Same account always uses same proxy. */
  proxy?: string;
  status: "active" | "cooldown" | "banned" | "needs_login";
  lastUsedAt: number;
  lastLoginAt: number;
  consecutiveFailures: number;
  cooldownUntil: number;
  cookiesValid: boolean;
};

export type AccountPoolConfig = {
  configPath?: string;
  maxConsecutiveFailures?: number; // default 3 → cooldown
  banThreshold?: number; // default 10 → banned
  cooldownMs?: number; // default 1_800_000 (30 min)
};

export type AccountPool = {
  /** Get the best available account for a platform+region (LRU). */
  getAccount(platform: string, region?: string): AccountCredential | null;
  /** Mark successful login. */
  markLoginSuccess(accountId: string): void;
  /** Mark failed login/fetch attempt. */
  markLoginFailed(accountId: string): void;
  /** Mark account as banned (manual or automatic). */
  markBanned(accountId: string): void;
  /** Mark that this account's cookies expired and needs re-login. */
  markNeedsRelogin(accountId: string): void;
  /** Mark cookies as valid after successful login. */
  markCookiesValid(accountId: string): void;
  /** Get all accounts, optionally filtered by platform. */
  getAll(platform?: string): AccountCredential[];
  /** Number of accounts in the pool. */
  readonly size: number;
};

// ---------------------------------------------------------------------------
// JSON config shape
// ---------------------------------------------------------------------------

type AccountJsonEntry = {
  id: string;
  platform: string;
  email?: string;
  phone?: string;
  password: string;
  region?: string;
  proxy?: string;
};

type AccountsJson = {
  accounts?: AccountJsonEntry[];
  proxies?: Array<{ url: string; region?: string; type?: string }>;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_FAILURES = 3;
const DEFAULT_BAN_THRESHOLD = 10;
const DEFAULT_COOLDOWN_MS = 1_800_000; // 30 min

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function loadAccountsFromFile(configPath: string): AccountCredential[] {
  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const json = JSON.parse(raw) as AccountsJson;
    const accounts: AccountCredential[] = [];

    for (const entry of json.accounts ?? []) {
      if (!entry.id || !entry.platform || !entry.password) {
        logDebug(`[account-pool] Skipping invalid account entry: ${JSON.stringify(entry)}`);
        continue;
      }
      accounts.push({
        id: entry.id,
        platform: entry.platform.toLowerCase(),
        email: entry.email,
        phone: entry.phone,
        password: entry.password,
        region: (entry.region ?? "").toLowerCase(),
        proxy: entry.proxy,
        status: "needs_login",
        lastUsedAt: 0,
        lastLoginAt: 0,
        consecutiveFailures: 0,
        cooldownUntil: 0,
        cookiesValid: false,
      });
    }

    return accounts;
  } catch (err) {
    logDebug(`[account-pool] Failed to load ${configPath}: ${String(err)}`);
    return [];
  }
}

export function loadAccountPool(config?: AccountPoolConfig): AccountPool {
  const configPath = config?.configPath ?? join(homedir(), ".openclaw", "accounts.json");
  const maxFailures = config?.maxConsecutiveFailures ?? DEFAULT_MAX_FAILURES;
  const banThreshold = config?.banThreshold ?? DEFAULT_BAN_THRESHOLD;
  const cooldownMs = config?.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  const accounts = loadAccountsFromFile(configPath);
  const accountMap = new Map<string, AccountCredential>();
  for (const a of accounts) {
    accountMap.set(a.id, a);
  }

  if (accounts.length > 0) {
    logDebug(`[account-pool] Loaded ${accounts.length} accounts from ${configPath}`);
  }

  function isAvailable(account: AccountCredential, now: number): boolean {
    if (account.status === "banned") {
      return false;
    }
    if (account.status === "cooldown") {
      if (account.cooldownUntil > now) {
        return false;
      }
      // Cooldown expired, reset to needs_login
      account.status = "needs_login";
      account.consecutiveFailures = 0;
    }
    return true;
  }

  return {
    getAccount(platform: string, region?: string): AccountCredential | null {
      const now = Date.now();
      const candidates = accounts.filter((a) => {
        if (a.platform !== platform.toLowerCase()) {
          return false;
        }
        if (region && a.region && a.region !== region.toLowerCase()) {
          return false;
        }
        return isAvailable(a, now);
      });

      if (candidates.length === 0) {
        return null;
      }

      // LRU: pick the one with smallest lastUsedAt
      candidates.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      const picked = candidates[0];
      picked.lastUsedAt = now;
      return picked;
    },

    markLoginSuccess(accountId: string): void {
      const a = accountMap.get(accountId);
      if (!a) {
        return;
      }
      a.status = "active";
      a.consecutiveFailures = 0;
      a.cooldownUntil = 0;
      a.lastLoginAt = Date.now();
      a.cookiesValid = true;
    },

    markLoginFailed(accountId: string): void {
      const a = accountMap.get(accountId);
      if (!a) {
        return;
      }
      a.consecutiveFailures++;

      if (a.consecutiveFailures >= banThreshold) {
        a.status = "banned";
        logDebug(`[account-pool] Account ${accountId} BANNED (${a.consecutiveFailures} failures)`);
      } else if (a.consecutiveFailures >= maxFailures) {
        a.status = "cooldown";
        a.cooldownUntil = Date.now() + cooldownMs;
        logDebug(`[account-pool] Account ${accountId} cooling down for ${cooldownMs / 1000}s`);
      }
    },

    markBanned(accountId: string): void {
      const a = accountMap.get(accountId);
      if (!a) {
        return;
      }
      a.status = "banned";
    },

    markNeedsRelogin(accountId: string): void {
      const a = accountMap.get(accountId);
      if (!a) {
        return;
      }
      a.status = "needs_login";
      a.cookiesValid = false;
    },

    markCookiesValid(accountId: string): void {
      const a = accountMap.get(accountId);
      if (!a) {
        return;
      }
      a.cookiesValid = true;
      a.status = "active";
    },

    getAll(platform?: string): AccountCredential[] {
      if (!platform) {
        return [...accounts];
      }
      return accounts.filter((a) => a.platform === platform.toLowerCase());
    },

    get size(): number {
      return accounts.length;
    },
  };
}
