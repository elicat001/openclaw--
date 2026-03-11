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
  /** Preferred proxy tier for this domain. */
  proxyTier?: "residential" | "datacenter" | "any";
};

// ── Known anti-bot domains ────────────────────────────────────────

const KNOWN_DOMAIN_PROFILES: DomainProfile[] = [
  {
    patterns: ["shopee.*", "*.shopee.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "residential",
  },
  {
    patterns: ["lazada.*", "*.lazada.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "residential",
  },
  {
    patterns: ["amazon.*", "*.amazon.*", "amzn.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "residential",
  },
  {
    patterns: ["aliexpress.*", "*.aliexpress.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "datacenter",
  },
  {
    patterns: ["ebay.*", "*.ebay.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "datacenter",
  },
  {
    patterns: ["linkedin.com", "*.linkedin.com"],
    defaultMode: "tls_impersonate",
    crawlProfile: "conservative",
    warmupPath: null,
    requiresCookies: true,
    proxyTier: "residential",
  },
  {
    patterns: ["indeed.com", "*.indeed.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "datacenter",
  },
  {
    patterns: ["walmart.com", "*.walmart.com"],
    defaultMode: "tls_impersonate",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "residential",
  },
  {
    patterns: ["target.com", "*.target.com"],
    defaultMode: "tls_impersonate",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "datacenter",
  },
  {
    patterns: ["mercadolibre.*", "*.mercadolibre.*", "mercadolivre.*", "*.mercadolivre.*"],
    defaultMode: "tls_impersonate",
    crawlProfile: "balanced",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "residential",
  },
  {
    patterns: ["tokopedia.com", "*.tokopedia.com"],
    defaultMode: "tls_impersonate",
    crawlProfile: "conservative",
    warmupPath: "/",
    requiresCookies: true,
    proxyTier: "residential",
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

// ── Proxy Pool (re-export from dedicated module) ─────────────────

export { createProxyPool } from "./web-fetch-proxy-pool.js";
export type { ProxyConfig, ProxyPool } from "./web-fetch-proxy-pool.js";
