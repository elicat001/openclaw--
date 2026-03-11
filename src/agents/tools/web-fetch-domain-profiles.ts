/**
 * Domain-level anti-detection profiles.
 * Known heavy anti-bot domains (Shopee, Lazada, Amazon, etc.) are routed
 * through stealth mode by default instead of wasting time on direct HTTP.
 */

import type { EscalationStrategy } from "./web-fetch-escalation.js";

export type DomainProfile = {
  /** Domain glob patterns, e.g. "shopee.*", "*.lazada.com" */
  patterns: string[];
  /** Starting escalation strategy for this domain. */
  defaultMode: EscalationStrategy;
  /** Recommended crawl behavior profile. */
  crawlProfile: "conservative" | "balanced" | "aggressive";
  /** Path to visit for session warmup (e.g. "/"). null = no warmup. */
  warmupPath: string | null;
  /** Whether this domain requires cookie persistence to function. */
  requiresCookies: boolean;
};

// ── Known anti-bot domains ────────────────────────────────────────

const KNOWN_DOMAIN_PROFILES: DomainProfile[] = [
  {
    patterns: ["shopee.*", "*.shopee.*"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
  },
  {
    patterns: ["lazada.*", "*.lazada.*"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
  },
  {
    patterns: ["amazon.*", "*.amazon.*", "amzn.*"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
  },
  {
    patterns: ["aliexpress.*", "*.aliexpress.*"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
  },
  {
    patterns: ["ebay.*", "*.ebay.*"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
  },
  {
    patterns: ["linkedin.com", "*.linkedin.com"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "conservative",
    warmupPath: null,
    requiresCookies: true,
  },
  {
    patterns: ["indeed.com", "*.indeed.*"],
    defaultMode: "scrapling_stealth",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
  },
];

// Custom profiles added at runtime
const customProfiles: DomainProfile[] = [];

/** Register a custom domain profile. */
export function registerDomainProfile(profile: DomainProfile): void {
  customProfiles.push(profile);
}

function globToRegex(pattern: string): RegExp {
  // Convert glob pattern like "shopee.*" to regex ^shopee\..+$
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+");
  return new RegExp(`^${escaped}$`, "i");
}

/** Find the matching domain profile for a hostname. Custom profiles take priority. */
export function matchDomainProfile(hostname: string): DomainProfile | null {
  const host = hostname.toLowerCase();

  // Check custom profiles first
  for (const profile of customProfiles) {
    for (const pattern of profile.patterns) {
      if (globToRegex(pattern).test(host)) {
        return profile;
      }
    }
  }

  // Then check built-in profiles
  for (const profile of KNOWN_DOMAIN_PROFILES) {
    for (const pattern of profile.patterns) {
      if (globToRegex(pattern).test(host)) {
        return profile;
      }
    }
  }

  return null;
}

/**
 * Resolve the effective starting escalation strategy for a URL.
 * Returns the domain profile's default or "direct" for unknown domains.
 */
export function resolveStartStrategy(hostname: string): EscalationStrategy {
  const profile = matchDomainProfile(hostname);
  return profile?.defaultMode ?? "direct";
}

// ── Proxy Pool Interface (stub for future integration) ───────────

export type ProxyConfig = {
  url: string;
  region?: string;
  protocol?: "http" | "socks5";
  maxConcurrent?: number;
  cooldownMs?: number;
};

export type ProxyPool = {
  getProxy(domain: string): ProxyConfig | null;
  markFailed(proxy: ProxyConfig): void;
  markSuccess(proxy: ProxyConfig): void;
  addProxies(proxies: ProxyConfig[]): void;
};

/** Create a proxy pool. Returns null from getProxy when no proxies are configured. */
export function createProxyPool(proxies?: ProxyConfig[]): ProxyPool {
  const pool = [...(proxies ?? [])];
  const failures = new Map<string, number>();

  return {
    getProxy(_domain: string): ProxyConfig | null {
      if (pool.length === 0) {
        return null;
      }
      // Simple round-robin, skip failed proxies
      const available = pool.filter((p) => (failures.get(p.url) ?? 0) < 3);
      if (available.length === 0) {
        return null;
      }
      return available[Math.floor(Math.random() * available.length)];
    },
    markFailed(proxy: ProxyConfig): void {
      failures.set(proxy.url, (failures.get(proxy.url) ?? 0) + 1);
    },
    markSuccess(proxy: ProxyConfig): void {
      failures.delete(proxy.url);
    },
    addProxies(newProxies: ProxyConfig[]): void {
      pool.push(...newProxies);
    },
  };
}
