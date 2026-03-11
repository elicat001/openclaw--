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
import type { CookieJar } from "./web-fetch-cookie-jar.js";
import { matchDomainProfile } from "./web-fetch-domain-profiles.js";
import {
  buildBrowserHeaders,
  type BrowserIdentity,
  buildIdentityHeaders,
  pickUserAgent,
} from "./web-fetch-headers.js";

export type EscalationStrategy =
  | "direct"
  | "retry_with_new_headers"
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
};

const DEFAULT_RETRY_DELAY_MS = 1_500;
const MAX_RETRY_AFTER_MS = 30_000;

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
    const isScrapling = strategy === "scrapling_fast" || strategy === "scrapling_stealth";
    if (!isScrapling || config.scraplingAvailable) {
      return strategy;
    }
    // Suggestion unavailable, fall through to chain
  }

  // Otherwise escalate through the chain
  const chain: EscalationStrategy[] = [
    "retry_with_new_headers",
    "scrapling_fast",
    "scrapling_stealth",
    "firecrawl",
  ];

  for (const strategy of chain) {
    if (attempted.has(strategy)) {
      continue;
    }
    if (strategy === "scrapling_fast" || strategy === "scrapling_stealth") {
      if (!config.scraplingAvailable) {
        continue;
      }
    }
    if (strategy === "firecrawl" && !config.firecrawlAvailable) {
      continue;
    }
    return strategy;
  }

  return null;
}

function mapSuggestionToStrategy(suggestion: EscalationSuggestion): EscalationStrategy {
  return suggestion;
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
  const startStrategy = domainProfile?.defaultMode ?? "direct";

  // If domain requires stealth from the start, skip direct and go straight to scrapling
  if (
    startStrategy === "scrapling_stealth" &&
    config.scraplingAvailable &&
    !attempted.has("scrapling_stealth")
  ) {
    attempted.add("direct");
    attempted.add("retry_with_new_headers");
    attempted.add("scrapling_fast");
    attempted.add("scrapling_stealth");

    logDebug(
      `[web-fetch-escalation] domain profile match for ${hostname}, starting with scrapling_stealth`,
    );

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
      // Store returned cookies in session
      if (result.cookies && sessionState?.cookieJar) {
        sessionState.cookieJar.importCookies(
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

    // Fall through to firecrawl
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
      // Respect Retry-After header
      const retryAfterMs = extractRetryAfterMs(directResult.headers);
      const delayMs = retryAfterMs
        ? Math.min(retryAfterMs, MAX_RETRY_AFTER_MS)
        : DEFAULT_RETRY_DELAY_MS;
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
        // Store returned cookies in session
        if (result.cookies && sessionState?.cookieJar) {
          sessionState.cookieJar.importCookies(
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

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
