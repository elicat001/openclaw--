/**
 * Proxy pool with health tracking, selection strategies, and cooldown recovery.
 * Replaces the stub ProxyPool in web-fetch-domain-profiles.ts.
 */

export type ProxyConfig = {
  url: string;
  region?: string;
  protocol?: "http" | "socks5";
  maxConcurrent?: number;
  cooldownMs?: number;
};

export type ProxyHealth = {
  successCount: number;
  failCount: number;
  consecutiveFailures: number;
  lastUsedMs: number;
  avgLatencyMs: number;
  cooldownUntil: number; // epoch ms, 0 = not in cooldown
};

export type ProxyPoolConfig = {
  proxies?: ProxyConfig[];
  envVarNames?: string[]; // default: ["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY"]
  maxConsecutiveFailures?: number; // default 5
  cooldownMs?: number; // default 300_000 (5 min)
  strategy?: "round-robin" | "least-recently-used" | "domain-affinity";
};

export type ProxyPool = {
  getProxy(domain: string): ProxyConfig | null;
  markFailed(proxy: ProxyConfig): void;
  markSuccess(proxy: ProxyConfig, latencyMs?: number): void;
  addProxies(proxies: ProxyConfig[]): void;
  getStats(): Map<string, ProxyHealth>;
  readonly size: number;
};

const DEFAULT_ENV_VARS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"];
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;
const DEFAULT_COOLDOWN_MS = 300_000;
const EMA_ALPHA = 0.3;

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function loadEnvProxies(varNames: string[]): ProxyConfig[] {
  const seen = new Set<string>();
  const result: ProxyConfig[] = [];
  for (const name of varNames) {
    const val = process.env[name];
    if (val && !seen.has(val)) {
      seen.add(val);
      result.push({ url: val });
    }
  }
  return result;
}

function initHealth(): ProxyHealth {
  return {
    successCount: 0,
    failCount: 0,
    consecutiveFailures: 0,
    lastUsedMs: 0,
    avgLatencyMs: 0,
    cooldownUntil: 0,
  };
}

export function createProxyPool(config?: ProxyPoolConfig): ProxyPool {
  const envVarNames = config?.envVarNames ?? DEFAULT_ENV_VARS;
  const maxConsecutiveFailures = config?.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  const cooldownMs = config?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const strategy = config?.strategy ?? "round-robin";

  const pool: ProxyConfig[] = [];
  const healthMap = new Map<string, ProxyHealth>();

  // Deduplicate by URL when merging config proxies + env proxies
  const seen = new Set<string>();
  function addUnique(proxies: ProxyConfig[]): void {
    for (const p of proxies) {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        pool.push(p);
        healthMap.set(p.url, initHealth());
      }
    }
  }

  addUnique(config?.proxies ?? []);
  addUnique(loadEnvProxies(envVarNames));

  let rrIndex = 0;

  function isAvailable(health: ProxyHealth, now: number): boolean {
    if (health.consecutiveFailures >= maxConsecutiveFailures) {
      return health.cooldownUntil > 0 && health.cooldownUntil < now;
    }
    return true;
  }

  function getAvailable(now: number): ProxyConfig[] {
    return pool.filter((p) => {
      const h = healthMap.get(p.url);
      return h ? isAvailable(h, now) : true;
    });
  }

  function selectRoundRobin(now: number): ProxyConfig | null {
    const available = getAvailable(now);
    if (available.length === 0) {
      return null;
    }
    const proxy = available[rrIndex % available.length];
    rrIndex = (rrIndex + 1) % available.length;
    return proxy;
  }

  function selectLRU(now: number): ProxyConfig | null {
    const available = getAvailable(now);
    if (available.length === 0) {
      return null;
    }
    let best = available[0];
    let bestTime = healthMap.get(best.url)?.lastUsedMs ?? 0;
    for (let i = 1; i < available.length; i++) {
      const t = healthMap.get(available[i].url)?.lastUsedMs ?? 0;
      if (t < bestTime) {
        bestTime = t;
        best = available[i];
      }
    }
    return best;
  }

  function selectDomainAffinity(domain: string, now: number): ProxyConfig | null {
    const available = getAvailable(now);
    if (available.length === 0) {
      return null;
    }
    const idx = hashString(domain) % available.length;
    return available[idx];
  }

  return {
    getProxy(domain: string): ProxyConfig | null {
      if (pool.length === 0) {
        return null;
      }
      const now = Date.now();
      let proxy: ProxyConfig | null;
      switch (strategy) {
        case "least-recently-used":
          proxy = selectLRU(now);
          break;
        case "domain-affinity":
          proxy = selectDomainAffinity(domain, now);
          break;
        default:
          proxy = selectRoundRobin(now);
      }
      if (proxy) {
        const h = healthMap.get(proxy.url);
        if (h) {
          h.lastUsedMs = now;
        }
      }
      return proxy;
    },

    markFailed(proxy: ProxyConfig): void {
      const h = healthMap.get(proxy.url);
      if (!h) {
        return;
      }
      h.failCount++;
      h.consecutiveFailures++;
      if (h.consecutiveFailures >= maxConsecutiveFailures) {
        h.cooldownUntil = Date.now() + cooldownMs;
      }
    },

    markSuccess(proxy: ProxyConfig, latencyMs?: number): void {
      const h = healthMap.get(proxy.url);
      if (!h) {
        return;
      }
      h.successCount++;
      h.consecutiveFailures = 0;
      h.cooldownUntil = 0;
      if (latencyMs !== undefined) {
        h.avgLatencyMs =
          h.avgLatencyMs === 0
            ? latencyMs
            : h.avgLatencyMs * (1 - EMA_ALPHA) + latencyMs * EMA_ALPHA;
      }
    },

    addProxies(proxies: ProxyConfig[]): void {
      addUnique(proxies);
    },

    getStats(): Map<string, ProxyHealth> {
      return new Map(healthMap);
    },

    get size(): number {
      return pool.length;
    },
  };
}
