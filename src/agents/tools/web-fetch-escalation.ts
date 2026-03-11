/**
 * Smart escalation chain for web fetching.
 * When a direct fetch is blocked by anti-bot systems, automatically escalates
 * through increasingly powerful strategies:
 *   direct → retry_with_new_headers → scrapling_fast → scrapling_stealth → firecrawl
 */

import { logDebug } from "../../logger.js";
import { sleep } from "../../utils.js";
import { PYTHON_SCRIPT, runPython } from "./scrapling-tool.js";
import {
  detectBlock,
  extractRetryAfterMs,
  type BlockDetectionResult,
  type EscalationSuggestion,
} from "./web-fetch-block-detect.js";
import { fetchWithCamoufox } from "./web-fetch-camoufox-engine.js";
import type { CookieJar } from "./web-fetch-cookie-jar.js";
import { matchDomainProfile } from "./web-fetch-domain-profiles.js";
import {
  buildBrowserHeaders,
  type BrowserIdentity,
  buildIdentityHeaders,
  pickUserAgent,
} from "./web-fetch-headers.js";
import { fetchWithTlsImpersonation, pickImpersonateProfile } from "./web-fetch-tls-engine.js";

export type EscalationStrategy =
  | "direct"
  | "retry_with_new_headers"
  | "tls_impersonate"
  | "camoufox_stealth"
  | "scrapling_fast"
  | "scrapling_stealth"
  | "firecrawl";

export type EscalationStep = {
  strategy: EscalationStrategy;
  outcome: "success" | "blocked" | "error";
  reason?: string;
};

export type EscalationConfig = {
  maxBlockRetries: number;
  scraplingAvailable: boolean;
  firecrawlAvailable: boolean;
  tlsEngineAvailable?: boolean;
  camoufoxAvailable?: boolean;
  proxyPool?: import("./web-fetch-proxy-pool.js").ProxyPool;
};

const BASE_RETRY_DELAY_MS = 1_500;
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

/** Exponential backoff with jitter: min(base * 2^attempt + random(0, 1000), 30000) */
function calculateBackoff(attempt: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
  return Math.min(delay, MAX_BACKOFF_MS);
}

// ── Circuit Breaker ──────────────────────────────────────────────
// Remember the last successful strategy per domain so we skip failed layers.

const circuitBreakerMap = new Map<string, EscalationStrategy>();

/** Record a successful strategy for a domain. */
function recordSuccessfulStrategy(domain: string, strategy: EscalationStrategy): void {
  circuitBreakerMap.set(domain, strategy);
}

/** Get the last known successful strategy for a domain, if any. */
function getLastSuccessfulStrategy(domain: string): EscalationStrategy | undefined {
  return circuitBreakerMap.get(domain);
}

/**
 * Call scrapling directly via the Python subprocess.
 * Returns the extracted text and status, or null if scrapling fails.
 */
export type ScraplingResult = {
  text: string;
  status: number;
  cookies?: Array<{ name: string; value: string; domain: string; path: string }>;
};

export async function callScraplingInternal(params: {
  url: string;
  mode: "fast" | "stealth";
  maxChars: number;
  solveCloudflare?: boolean;
  cookies?: Array<{ name: string; value: string; domain: string; path: string }>;
  viewport?: { width: number; height: number };
}): Promise<ScraplingResult | null> {
  const stdinPayload = JSON.stringify({
    url: params.url,
    mode: params.mode,
    maxChars: params.maxChars,
    solveCloudflare: params.solveCloudflare ?? false,
    cookies: params.cookies ?? [],
    viewport: params.viewport ?? undefined,
  });

  try {
    const { stdout } = await runPython(PYTHON_SCRIPT, stdinPayload);
    const result = JSON.parse(stdout.trim()) as {
      text?: string;
      status?: number;
      cookies?: Array<{ name: string; value: string; domain: string; path: string }>;
    };
    if (typeof result.text !== "string") {
      return null;
    }
    return {
      text: result.text,
      status: result.status ?? 200,
      cookies: result.cookies,
    };
  } catch {
    return null;
  }
}

/**
 * Determine the next escalation strategy based on the current block detection result
 * and the already-attempted strategies.
 */
function nextStrategy(
  blockResult: BlockDetectionResult,
  attempted: Set<EscalationStrategy>,
  config: EscalationConfig,
): EscalationStrategy | null {
  const suggestion = blockResult.suggestedEscalation;

  // Follow the suggestion if we haven't tried it and it's available
  if (suggestion && !attempted.has(mapSuggestionToStrategy(suggestion))) {
    const strategy = mapSuggestionToStrategy(suggestion);
    if (isStrategyAvailable(strategy, config)) {
      return strategy;
    }
  }

  // New escalation chain: tls_impersonate → camoufox → scrapling_stealth → firecrawl
  const chain: EscalationStrategy[] = [
    "retry_with_new_headers",
    "tls_impersonate",
    "camoufox_stealth",
    "scrapling_fast",
    "scrapling_stealth",
    "firecrawl",
  ];

  for (const strategy of chain) {
    if (attempted.has(strategy)) {
      continue;
    }
    if (!isStrategyAvailable(strategy, config)) {
      continue;
    }
    return strategy;
  }

  return null;
}

function isStrategyAvailable(strategy: EscalationStrategy, config: EscalationConfig): boolean {
  switch (strategy) {
    case "tls_impersonate":
      return config.tlsEngineAvailable === true;
    case "camoufox_stealth":
      return config.camoufoxAvailable === true;
    case "scrapling_fast":
    case "scrapling_stealth":
      return config.scraplingAvailable;
    case "firecrawl":
      return config.firecrawlAvailable;
    default:
      return true;
  }
}

function mapSuggestionToStrategy(suggestion: EscalationSuggestion): EscalationStrategy {
  return suggestion as EscalationStrategy;
}

export type DirectFetchFn = (params: { headers: Record<string, string> }) => Promise<{
  status: number;
  headers: Headers;
  body: string;
  contentType?: string;
}>;

export type FirecrawlFallbackFn = () => Promise<Record<string, unknown> | null>;

/**
 * Run a web fetch with automatic escalation through anti-bot bypass strategies.
 *
 * @param directFetch - Function to perform a direct HTTP fetch (provided by web-fetch.ts)
 * @param firecrawlFallback - Function to try Firecrawl (provided by web-fetch.ts)
 * @param url - The URL being fetched
 * @param maxChars - Max characters for scrapling content
 * @param config - Escalation configuration
 *
 * @returns The escalation path taken and either the successful direct response or scrapling text.
 */
/** Session anti-detection state passed through from the crawl session. */
export type SessionAntiDetectionState = {
  cookieJar: CookieJar;
  identity: BrowserIdentity;
  navigationHistory: string[];
};

/**
 * Perform a session warmup: visit the homepage in stealth mode to establish cookies.
 * Call this before the first real fetch on a domain that requires warmup.
 */
export async function performSessionWarmup(params: {
  baseUrl: string;
  warmupPath: string;
  cookieJar: CookieJar;
  identity: BrowserIdentity;
}): Promise<boolean> {
  const warmupUrl = `${params.baseUrl}${params.warmupPath}`;
  logDebug(`[web-fetch-escalation] session warmup: visiting ${warmupUrl}`);

  const result = await callScraplingInternal({
    url: warmupUrl,
    mode: "stealth",
    maxChars: 5000,
    solveCloudflare: true,
    viewport: params.identity.viewport,
  });

  if (!result) {
    logDebug("[web-fetch-escalation] session warmup failed");
    return false;
  }

  // Import cookies from the browser into our cookie jar
  if (result.cookies && result.cookies.length > 0) {
    params.cookieJar.importCookies(
      result.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: null,
        httpOnly: false,
        secure: false,
        sameSite: "lax" as const,
      })),
    );
    logDebug(`[web-fetch-escalation] warmup captured ${result.cookies.length} cookies`);
  }

  return true;
}

export async function runWithEscalation(params: {
  directFetch: DirectFetchFn;
  firecrawlFallback: FirecrawlFallbackFn;
  url: string;
  maxChars: number;
  config: EscalationConfig;
  /** Optional session state for cookie/identity-aware escalation. */
  sessionState?: SessionAntiDetectionState;
}): Promise<
  | {
      type: "direct";
      status: number;
      headers: Headers;
      body: string;
      contentType?: string;
      escalationPath: EscalationStep[];
    }
  | {
      type: "scrapling";
      text: string;
      status: number;
      mode: "fast" | "stealth";
      escalationPath: EscalationStep[];
    }
  | {
      type: "tls_impersonate";
      status: number;
      body: string;
      headers: Record<string, string>;
      escalationPath: EscalationStep[];
    }
  | {
      type: "camoufox";
      text: string;
      status: number;
      escalationPath: EscalationStep[];
    }
  | {
      type: "firecrawl";
      payload: Record<string, unknown>;
      escalationPath: EscalationStep[];
    }
> {
  const { directFetch, firecrawlFallback, url, maxChars, config, sessionState } = params;
  const escalationPath: EscalationStep[] = [];
  const attempted = new Set<EscalationStrategy>();

  // Check if domain profile says to skip direct fetch
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = "";
  }

  const domainProfile = hostname ? matchDomainProfile(hostname) : null;

  // Circuit breaker: use last successful strategy if known, else domain profile default
  const circuitBreakerStrategy = hostname ? getLastSuccessfulStrategy(hostname) : undefined;
  const startStrategy = circuitBreakerStrategy ?? domainProfile?.defaultMode ?? "direct";

  // If domain should start with tls_impersonate (fast path for known anti-bot domains)
  if (startStrategy === "tls_impersonate" && config.tlsEngineAvailable) {
    attempted.add("direct");
    attempted.add("retry_with_new_headers");
    attempted.add("tls_impersonate");

    logDebug(
      `[web-fetch-escalation] domain profile match for ${hostname}, starting with tls_impersonate`,
    );

    const cookieHeader = sessionState?.cookieJar.getCookieHeader(url) ?? "";
    const proxy = config.proxyPool?.getProxy(hostname) ?? undefined;
    const impersonateProfile = sessionState?.identity
      ? pickImpersonateProfile(sessionState.identity)
      : undefined;

    const result = await fetchWithTlsImpersonation({
      url,
      cookies: cookieHeader || undefined,
      proxy: proxy?.url,
      impersonate: impersonateProfile,
    });

    if (result && result.body.length > 100 && result.status < 400) {
      importSetCookieHeaders(result.headers, url, sessionState);
      if (proxy && config.proxyPool) {
        config.proxyPool.markSuccess(proxy);
      }
      if (hostname) {
        recordSuccessfulStrategy(hostname, "tls_impersonate");
      }
      escalationPath.push({ strategy: "tls_impersonate", outcome: "success" });
      return {
        type: "tls_impersonate",
        status: result.status,
        body: result.body,
        headers: result.headers,
        escalationPath,
      };
    }

    if (proxy && config.proxyPool) {
      config.proxyPool.markFailed(proxy);
    }
    escalationPath.push({ strategy: "tls_impersonate", outcome: "error" });
    logDebug(`[web-fetch-escalation] tls_impersonate failed for ${hostname}, escalating...`);

    // Continue to normal escalation (camoufox → scrapling → firecrawl)
  }

  // If domain should start with scrapling_stealth (legacy or circuit breaker)
  if (
    startStrategy === "scrapling_stealth" &&
    config.scraplingAvailable &&
    !attempted.has("scrapling_stealth")
  ) {
    attempted.add("direct");
    attempted.add("retry_with_new_headers");
    attempted.add("scrapling_fast");
    attempted.add("scrapling_stealth");

    logDebug(`[web-fetch-escalation] starting with scrapling_stealth for ${hostname}`);

    const scraplingCookies = sessionState?.cookieJar.exportForScrapling(url);
    const viewport = sessionState?.identity.viewport;

    const result = await callScraplingInternal({
      url,
      mode: "stealth",
      maxChars,
      solveCloudflare: true,
      cookies: scraplingCookies,
      viewport,
    });

    if (result && result.text.length > 100) {
      importCookiesFromResult(result.cookies, sessionState);
      if (hostname) {
        recordSuccessfulStrategy(hostname, "scrapling_stealth");
      }
      escalationPath.push({ strategy: "scrapling_stealth", outcome: "success" });
      return {
        type: "scrapling",
        text: result.text,
        status: result.status,
        mode: "stealth",
        escalationPath,
      };
    }

    escalationPath.push({ strategy: "scrapling_stealth", outcome: "error" });
    logDebug(`[web-fetch-escalation] scrapling_stealth failed for ${hostname}, trying firecrawl`);

    const firecrawlResult = await tryFirecrawl(
      firecrawlFallback,
      escalationPath,
      attempted,
      config,
    );
    if (firecrawlResult) {
      return firecrawlResult;
    }
  }

  // If circuit breaker points to camoufox
  if (
    startStrategy === "camoufox_stealth" &&
    config.camoufoxAvailable &&
    !attempted.has("camoufox_stealth")
  ) {
    attempted.add("direct");
    attempted.add("retry_with_new_headers");
    attempted.add("tls_impersonate");
    attempted.add("camoufox_stealth");

    const camoufoxResult = await tryCamoufox(url, sessionState, config, hostname);
    if (camoufoxResult) {
      if (hostname) {
        recordSuccessfulStrategy(hostname, "camoufox_stealth");
      }
      escalationPath.push({ strategy: "camoufox_stealth", outcome: "success" });
      return { ...camoufoxResult, escalationPath };
    }
    escalationPath.push({ strategy: "camoufox_stealth", outcome: "error" });
  }

  // Step 1: Direct fetch with initial headers
  attempted.add("direct");
  let initialHeaders: Record<string, string>;
  if (sessionState) {
    // Use session identity + cookies for consistent fingerprinting
    initialHeaders = buildIdentityHeaders({
      identity: sessionState.identity,
      referer:
        sessionState.navigationHistory.length > 0
          ? sessionState.navigationHistory[sessionState.navigationHistory.length - 1]
          : undefined,
      targetUrl: url,
      acceptMarkdown: true,
    });
    const cookieHeader = sessionState.cookieJar.getCookieHeader(url);
    if (cookieHeader) {
      initialHeaders["Cookie"] = cookieHeader;
    }
  } else {
    initialHeaders = buildBrowserHeaders({ userAgent: pickUserAgent(), acceptMarkdown: true });
  }
  let directResult: Awaited<ReturnType<DirectFetchFn>>;

  try {
    directResult = await directFetch({ headers: initialHeaders });
  } catch (err) {
    // Network error on direct fetch — try firecrawl
    escalationPath.push({ strategy: "direct", outcome: "error", reason: String(err) });
    logDebug(`[web-fetch-escalation] direct fetch error for ${extractHost(url)}: ${String(err)}`);

    const firecrawlResult = await tryFirecrawl(
      firecrawlFallback,
      escalationPath,
      attempted,
      config,
    );
    if (firecrawlResult) {
      return firecrawlResult;
    }

    throw err;
  }

  // Check if direct response is blocked
  let blockResult = detectBlock({
    status: directResult.status,
    headers: directResult.headers,
    body: directResult.body,
    url,
    contentType: directResult.contentType,
  });

  if (!blockResult.blocked) {
    escalationPath.push({ strategy: "direct", outcome: "success" });
    return { type: "direct", ...directResult, escalationPath };
  }

  escalationPath.push({
    strategy: "direct",
    outcome: "blocked",
    reason: blockResult.reason,
  });
  logDebug(
    `[web-fetch-escalation] blocked (${blockResult.reason}) for ${extractHost(url)}, escalating...`,
  );

  // Step 2+: Escalate through strategies
  let retryCount = 0;

  while (retryCount < config.maxBlockRetries + 2) {
    const strategy = nextStrategy(blockResult, attempted, config);
    if (!strategy) {
      break;
    }
    attempted.add(strategy);
    retryCount++;

    if (strategy === "retry_with_new_headers") {
      // Exponential backoff with Retry-After respect
      const retryAfterMs = extractRetryAfterMs(directResult.headers);
      const delayMs = retryAfterMs
        ? Math.min(retryAfterMs, MAX_RETRY_AFTER_MS)
        : calculateBackoff(retryCount);
      await sleep(delayMs);

      // Use session identity if available, otherwise pick new UA
      if (sessionState) {
        initialHeaders = buildIdentityHeaders({
          identity: sessionState.identity,
          referer:
            sessionState.navigationHistory.length > 0
              ? sessionState.navigationHistory[sessionState.navigationHistory.length - 1]
              : undefined,
          targetUrl: url,
          acceptMarkdown: true,
        });
        const cookieHeader = sessionState.cookieJar.getCookieHeader(url);
        if (cookieHeader) {
          initialHeaders["Cookie"] = cookieHeader;
        }
      } else {
        initialHeaders = buildBrowserHeaders({ userAgent: pickUserAgent(), acceptMarkdown: true });
      }
      try {
        directResult = await directFetch({ headers: initialHeaders });
        blockResult = detectBlock({
          status: directResult.status,
          headers: directResult.headers,
          body: directResult.body,
          url,
          contentType: directResult.contentType,
        });

        if (!blockResult.blocked) {
          escalationPath.push({ strategy: "retry_with_new_headers", outcome: "success" });
          return { type: "direct", ...directResult, escalationPath };
        }
        escalationPath.push({
          strategy: "retry_with_new_headers",
          outcome: "blocked",
          reason: blockResult.reason,
        });
      } catch {
        escalationPath.push({ strategy: "retry_with_new_headers", outcome: "error" });
      }
      logDebug(`[web-fetch-escalation] retry_with_new_headers failed for ${extractHost(url)}`);
    } else if (strategy === "tls_impersonate") {
      logDebug(`[web-fetch-escalation] trying tls_impersonate for ${extractHost(url)}`);
      await sleep(calculateBackoff(retryCount));

      const cookieHeader = sessionState?.cookieJar.getCookieHeader(url) ?? "";
      const proxy = config.proxyPool?.getProxy(hostname) ?? undefined;
      const impersonateProfile = sessionState?.identity
        ? pickImpersonateProfile(sessionState.identity)
        : undefined;

      const tlsResult = await fetchWithTlsImpersonation({
        url,
        cookies: cookieHeader || undefined,
        proxy: proxy?.url,
        impersonate: impersonateProfile,
      });

      if (tlsResult && tlsResult.body.length > 100 && tlsResult.status < 400) {
        importSetCookieHeaders(tlsResult.headers, url, sessionState);
        if (proxy && config.proxyPool) {
          config.proxyPool.markSuccess(proxy);
        }
        if (hostname) {
          recordSuccessfulStrategy(hostname, "tls_impersonate");
        }
        escalationPath.push({ strategy: "tls_impersonate", outcome: "success" });
        return {
          type: "tls_impersonate",
          status: tlsResult.status,
          body: tlsResult.body,
          headers: tlsResult.headers,
          escalationPath,
        };
      }
      if (proxy && config.proxyPool) {
        config.proxyPool.markFailed(proxy);
      }
      escalationPath.push({ strategy: "tls_impersonate", outcome: "error" });
      logDebug(`[web-fetch-escalation] tls_impersonate failed for ${extractHost(url)}`);
    } else if (strategy === "camoufox_stealth") {
      logDebug(`[web-fetch-escalation] trying camoufox_stealth for ${extractHost(url)}`);
      await sleep(calculateBackoff(retryCount));

      const camoufoxResult = await tryCamoufox(url, sessionState, config, hostname);
      if (camoufoxResult) {
        if (hostname) {
          recordSuccessfulStrategy(hostname, "camoufox_stealth");
        }
        escalationPath.push({ strategy: "camoufox_stealth", outcome: "success" });
        return { ...camoufoxResult, escalationPath };
      }
      escalationPath.push({ strategy: "camoufox_stealth", outcome: "error" });
      logDebug(`[web-fetch-escalation] camoufox_stealth failed for ${extractHost(url)}`);
    } else if (strategy === "scrapling_fast" || strategy === "scrapling_stealth") {
      const mode = strategy === "scrapling_fast" ? "fast" : "stealth";
      logDebug(`[web-fetch-escalation] trying scrapling ${mode} for ${extractHost(url)}`);

      const scraplingCookies = sessionState?.cookieJar.exportForScrapling(url);
      const viewport = sessionState?.identity.viewport;

      const result = await callScraplingInternal({
        url,
        mode,
        maxChars,
        solveCloudflare: mode === "stealth",
        cookies: scraplingCookies,
        viewport,
      });

      if (result && result.text.length > 100) {
        importCookiesFromResult(result.cookies, sessionState);
        if (hostname) {
          recordSuccessfulStrategy(hostname, strategy);
        }
        escalationPath.push({ strategy, outcome: "success" });
        return {
          type: "scrapling",
          text: result.text,
          status: result.status,
          mode,
          escalationPath,
        };
      }
      escalationPath.push({ strategy, outcome: "error" });
      logDebug(`[web-fetch-escalation] scrapling ${mode} failed for ${extractHost(url)}`);
    } else if (strategy === "firecrawl") {
      try {
        const payload = await firecrawlFallback();
        if (payload) {
          escalationPath.push({ strategy: "firecrawl", outcome: "success" });
          return { type: "firecrawl" as const, payload, escalationPath };
        }
      } catch {
        // Firecrawl failed
      }
      escalationPath.push({ strategy: "firecrawl", outcome: "error" });
    }
  }

  // All escalation strategies exhausted, return the direct result as-is
  return { type: "direct", ...directResult, escalationPath };
}

async function tryFirecrawl(
  firecrawlFallback: FirecrawlFallbackFn,
  escalationPath: EscalationStep[],
  attempted: Set<EscalationStrategy>,
  config: EscalationConfig,
): Promise<{
  type: "firecrawl";
  payload: Record<string, unknown>;
  escalationPath: EscalationStep[];
} | null> {
  if (!config.firecrawlAvailable || attempted.has("firecrawl")) {
    return null;
  }
  attempted.add("firecrawl");

  try {
    const payload = await firecrawlFallback();
    if (payload) {
      escalationPath.push({ strategy: "firecrawl", outcome: "success" });
      return { type: "firecrawl", payload, escalationPath };
    }
  } catch {
    // Firecrawl failed
  }
  escalationPath.push({ strategy: "firecrawl", outcome: "error" });
  return null;
}

/** Import Set-Cookie headers from a TLS engine response into the session cookie jar. */
function importSetCookieHeaders(
  headers: Record<string, string>,
  url: string,
  sessionState?: SessionAntiDetectionState,
): void {
  if (!sessionState?.cookieJar) {
    return;
  }
  // Look for Set-Cookie header (case-insensitive)
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "set-cookie") {
      // Multiple cookies may be separated by newlines in the value
      for (const cookie of value.split("\n")) {
        sessionState.cookieJar.setCookie(cookie.trim(), url);
      }
    }
  }
}

/** Import cookies array from scrapling/camoufox results into the session. */
function importCookiesFromResult(
  cookies: Array<{ name: string; value: string; domain: string; path: string }> | undefined,
  sessionState?: SessionAntiDetectionState,
): void {
  if (!cookies || !sessionState?.cookieJar) {
    return;
  }
  sessionState.cookieJar.importCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: null,
      httpOnly: false,
      secure: false,
      sameSite: "lax" as const,
    })),
  );
}

/** Try Camoufox anti-detect browser for a URL. */
async function tryCamoufox(
  url: string,
  sessionState: SessionAntiDetectionState | undefined,
  config: EscalationConfig,
  hostname: string,
): Promise<{ type: "camoufox"; text: string; status: number } | null> {
  const proxy = config.proxyPool?.getProxy(hostname) ?? undefined;
  const cookies = sessionState?.cookieJar.exportCookies() ?? [];
  const viewport = sessionState?.identity.viewport;

  const result = await fetchWithCamoufox({
    url,
    cookies,
    viewport,
    proxy: proxy?.url,
    humanize: true,
  });

  if (result && result.text.length > 100) {
    importCookiesFromResult(result.cookies, sessionState);
    if (proxy && config.proxyPool) {
      config.proxyPool.markSuccess(proxy);
    }
    return { type: "camoufox", text: result.text, status: result.status };
  }

  if (proxy && config.proxyPool) {
    config.proxyPool.markFailed(proxy);
  }
  return null;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
