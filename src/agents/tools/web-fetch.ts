import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { normalizeResolvedSecretInputString } from "../../config/types.secrets.js";
import { SsrFBlockedError } from "../../infra/net/ssrf.js";
import { logDebug } from "../../logger.js";
import type { RuntimeWebFetchFirecrawlMetadata } from "../../secrets/runtime-web-tools.js";
import { wrapExternalContent, wrapWebContent } from "../../security/external-content.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { getActiveCrawlSession } from "./crawl-session.js";
import { isScraplingInstalled } from "./scrapling-tool.js";
import { isCamoufoxInstalled } from "./web-fetch-camoufox-engine.js";
import { matchDomainProfile } from "./web-fetch-domain-profiles.js";
import {
  performSessionWarmup,
  runWithEscalation,
  type EscalationStep,
} from "./web-fetch-escalation.js";
import { buildBrowserHeaders, pickUserAgent } from "./web-fetch-headers.js";
import { createProxyPool, type ProxyPool } from "./web-fetch-proxy-pool.js";
import { createDomainRateLimiter, extractDomain } from "./web-fetch-rate-limit.js";
import { isCurlCffiInstalled } from "./web-fetch-tls-engine.js";
import {
  extractReadableContent,
  htmlToMarkdown,
  markdownToText,
  truncateText,
  type ExtractMode,
} from "./web-fetch-utils.js";
import { fetchWithWebToolsNetworkGuard } from "./web-guarded-fetch.js";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  withTimeout,
  writeCache,
} from "./web-shared.js";

export { extractReadableContent } from "./web-fetch-utils.js";

const EXTRACT_MODES = ["markdown", "text"] as const;

const DEFAULT_FETCH_MAX_CHARS = 50_000;
const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 2_000_000;
const FETCH_MAX_RESPONSE_BYTES_MIN = 32_000;
const FETCH_MAX_RESPONSE_BYTES_MAX = 10_000_000;
const DEFAULT_FETCH_MAX_REDIRECTS = 3;
const DEFAULT_ERROR_MAX_CHARS = 4_000;
const DEFAULT_ERROR_MAX_BYTES = 64_000;
const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
const DEFAULT_FIRECRAWL_MAX_AGE_MS = 172_800_000;
/** @deprecated Use pickUserAgent() for rotation; kept as fallback for config override. */
const _DEFAULT_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

/** Singleton domain rate limiter, lazily reconfigured per createWebFetchTool. */
let domainRateLimiter = createDomainRateLimiter();

const WebFetchSchema = Type.Object({
  url: Type.String({ description: "HTTP or HTTPS URL to fetch." }),
  extractMode: Type.Optional(
    stringEnum(EXTRACT_MODES, {
      description: 'Extraction mode ("markdown" or "text").',
      default: "markdown",
    }),
  ),
  maxChars: Type.Optional(
    Type.Number({
      description: "Maximum characters to return (truncates when exceeded).",
      minimum: 100,
    }),
  ),
});

type WebFetchConfig = NonNullable<OpenClawConfig["tools"]>["web"] extends infer Web
  ? Web extends { fetch?: infer Fetch }
    ? Fetch
    : undefined
  : undefined;

type FirecrawlFetchConfig =
  | {
      enabled?: boolean;
      apiKey?: unknown;
      baseUrl?: string;
      onlyMainContent?: boolean;
      maxAgeMs?: number;
      timeoutSeconds?: number;
    }
  | undefined;

function resolveFetchConfig(cfg?: OpenClawConfig): WebFetchConfig {
  const fetch = cfg?.tools?.web?.fetch;
  if (!fetch || typeof fetch !== "object") {
    return undefined;
  }
  return fetch as WebFetchConfig;
}

function resolveFetchEnabled(params: { fetch?: WebFetchConfig; sandboxed?: boolean }): boolean {
  if (typeof params.fetch?.enabled === "boolean") {
    return params.fetch.enabled;
  }
  return true;
}

function resolveFetchReadabilityEnabled(fetch?: WebFetchConfig): boolean {
  if (typeof fetch?.readability === "boolean") {
    return fetch.readability;
  }
  return true;
}

function resolveFetchMaxCharsCap(fetch?: WebFetchConfig): number {
  const raw =
    fetch && "maxCharsCap" in fetch && typeof fetch.maxCharsCap === "number"
      ? fetch.maxCharsCap
      : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_FETCH_MAX_CHARS;
  }
  return Math.max(100, Math.floor(raw));
}

function resolveFetchMaxResponseBytes(fetch?: WebFetchConfig): number {
  const raw =
    fetch && "maxResponseBytes" in fetch && typeof fetch.maxResponseBytes === "number"
      ? fetch.maxResponseBytes
      : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_FETCH_MAX_RESPONSE_BYTES;
  }
  const value = Math.floor(raw);
  return Math.min(FETCH_MAX_RESPONSE_BYTES_MAX, Math.max(FETCH_MAX_RESPONSE_BYTES_MIN, value));
}

function resolveFirecrawlConfig(fetch?: WebFetchConfig): FirecrawlFetchConfig {
  if (!fetch || typeof fetch !== "object") {
    return undefined;
  }
  const firecrawl = "firecrawl" in fetch ? fetch.firecrawl : undefined;
  if (!firecrawl || typeof firecrawl !== "object") {
    return undefined;
  }
  return firecrawl as FirecrawlFetchConfig;
}

function resolveFirecrawlApiKey(firecrawl?: FirecrawlFetchConfig): string | undefined {
  const fromConfigRaw =
    firecrawl && "apiKey" in firecrawl
      ? normalizeResolvedSecretInputString({
          value: firecrawl.apiKey,
          path: "tools.web.fetch.firecrawl.apiKey",
        })
      : undefined;
  const fromConfig = normalizeSecretInput(fromConfigRaw);
  const fromEnv = normalizeSecretInput(process.env.FIRECRAWL_API_KEY);
  return fromConfig || fromEnv || undefined;
}

function resolveFirecrawlEnabled(params: {
  firecrawl?: FirecrawlFetchConfig;
  apiKey?: string;
}): boolean {
  if (typeof params.firecrawl?.enabled === "boolean") {
    return params.firecrawl.enabled;
  }
  return Boolean(params.apiKey);
}

function resolveFirecrawlBaseUrl(firecrawl?: FirecrawlFetchConfig): string {
  const raw =
    firecrawl && "baseUrl" in firecrawl && typeof firecrawl.baseUrl === "string"
      ? firecrawl.baseUrl.trim()
      : "";
  return raw || DEFAULT_FIRECRAWL_BASE_URL;
}

function resolveFirecrawlOnlyMainContent(firecrawl?: FirecrawlFetchConfig): boolean {
  if (typeof firecrawl?.onlyMainContent === "boolean") {
    return firecrawl.onlyMainContent;
  }
  return true;
}

function resolveFirecrawlMaxAgeMs(firecrawl?: FirecrawlFetchConfig): number | undefined {
  const raw =
    firecrawl && "maxAgeMs" in firecrawl && typeof firecrawl.maxAgeMs === "number"
      ? firecrawl.maxAgeMs
      : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  const parsed = Math.max(0, Math.floor(raw));
  return parsed > 0 ? parsed : undefined;
}

function resolveFirecrawlMaxAgeMsOrDefault(firecrawl?: FirecrawlFetchConfig): number {
  const resolved = resolveFirecrawlMaxAgeMs(firecrawl);
  if (typeof resolved === "number") {
    return resolved;
  }
  return DEFAULT_FIRECRAWL_MAX_AGE_MS;
}

function resolveMaxChars(value: unknown, fallback: number, cap: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(100, Math.floor(parsed));
  return Math.min(clamped, cap);
}

function resolveMaxRedirects(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.floor(parsed));
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trimStart();
  if (!trimmed) {
    return false;
  }
  const head = trimmed.slice(0, 256).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function formatWebFetchErrorDetail(params: {
  detail: string;
  contentType?: string | null;
  maxChars: number;
}): string {
  const { detail, contentType, maxChars } = params;
  if (!detail) {
    return "";
  }
  let text = detail;
  const contentTypeLower = contentType?.toLowerCase();
  if (contentTypeLower?.includes("text/html") || looksLikeHtml(detail)) {
    const rendered = htmlToMarkdown(detail);
    const withTitle = rendered.title ? `${rendered.title}\n${rendered.text}` : rendered.text;
    text = markdownToText(withTitle);
  }
  const truncated = truncateText(text.trim(), maxChars);
  return truncated.text;
}

function redactUrlForDebugLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname && parsed.pathname !== "/" ? `${parsed.origin}/...` : parsed.origin;
  } catch {
    return "[invalid-url]";
  }
}

const WEB_FETCH_WRAPPER_WITH_WARNING_OVERHEAD = wrapWebContent("", "web_fetch").length;
const WEB_FETCH_WRAPPER_NO_WARNING_OVERHEAD = wrapExternalContent("", {
  source: "web_fetch",
  includeWarning: false,
}).length;

function wrapWebFetchContent(
  value: string,
  maxChars: number,
): {
  text: string;
  truncated: boolean;
  rawLength: number;
  wrappedLength: number;
} {
  if (maxChars <= 0) {
    return { text: "", truncated: true, rawLength: 0, wrappedLength: 0 };
  }
  const includeWarning = maxChars >= WEB_FETCH_WRAPPER_WITH_WARNING_OVERHEAD;
  const wrapperOverhead = includeWarning
    ? WEB_FETCH_WRAPPER_WITH_WARNING_OVERHEAD
    : WEB_FETCH_WRAPPER_NO_WARNING_OVERHEAD;
  if (wrapperOverhead > maxChars) {
    const minimal = includeWarning
      ? wrapWebContent("", "web_fetch")
      : wrapExternalContent("", { source: "web_fetch", includeWarning: false });
    const truncatedWrapper = truncateText(minimal, maxChars);
    return {
      text: truncatedWrapper.text,
      truncated: true,
      rawLength: 0,
      wrappedLength: truncatedWrapper.text.length,
    };
  }
  const maxInner = Math.max(0, maxChars - wrapperOverhead);
  let truncated = truncateText(value, maxInner);
  let wrappedText = includeWarning
    ? wrapWebContent(truncated.text, "web_fetch")
    : wrapExternalContent(truncated.text, { source: "web_fetch", includeWarning: false });

  if (wrappedText.length > maxChars) {
    const excess = wrappedText.length - maxChars;
    const adjustedMaxInner = Math.max(0, maxInner - excess);
    truncated = truncateText(value, adjustedMaxInner);
    wrappedText = includeWarning
      ? wrapWebContent(truncated.text, "web_fetch")
      : wrapExternalContent(truncated.text, { source: "web_fetch", includeWarning: false });
  }

  return {
    text: wrappedText,
    truncated: truncated.truncated,
    rawLength: truncated.text.length,
    wrappedLength: wrappedText.length,
  };
}

function wrapWebFetchField(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  return wrapExternalContent(value, { source: "web_fetch", includeWarning: false });
}

function buildFirecrawlWebFetchPayload(params: {
  firecrawl: Awaited<ReturnType<typeof fetchFirecrawlContent>>;
  rawUrl: string;
  finalUrlFallback: string;
  statusFallback: number;
  extractMode: ExtractMode;
  maxChars: number;
  tookMs: number;
}): Record<string, unknown> {
  const wrapped = wrapWebFetchContent(params.firecrawl.text, params.maxChars);
  const wrappedTitle = params.firecrawl.title
    ? wrapWebFetchField(params.firecrawl.title)
    : undefined;
  return {
    url: params.rawUrl, // Keep raw for tool chaining
    finalUrl: params.firecrawl.finalUrl || params.finalUrlFallback, // Keep raw
    status: params.firecrawl.status ?? params.statusFallback,
    contentType: "text/markdown", // Protocol metadata, don't wrap
    title: wrappedTitle,
    extractMode: params.extractMode,
    extractor: "firecrawl",
    externalContent: {
      untrusted: true,
      source: "web_fetch",
      wrapped: true,
    },
    truncated: wrapped.truncated,
    length: wrapped.wrappedLength,
    rawLength: wrapped.rawLength, // Actual content length, not wrapped
    wrappedLength: wrapped.wrappedLength,
    fetchedAt: new Date().toISOString(),
    tookMs: params.tookMs,
    text: wrapped.text,
    warning: wrapWebFetchField(params.firecrawl.warning),
  };
}

function normalizeContentType(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const [raw] = value.split(";");
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export async function fetchFirecrawlContent(params: {
  url: string;
  extractMode: ExtractMode;
  apiKey: string;
  baseUrl: string;
  onlyMainContent: boolean;
  maxAgeMs: number;
  proxy: "auto" | "basic" | "stealth";
  storeInCache: boolean;
  timeoutSeconds: number;
}): Promise<{
  text: string;
  title?: string;
  finalUrl?: string;
  status?: number;
  warning?: string;
}> {
  const endpoint = resolveFirecrawlEndpoint(params.baseUrl);
  const body: Record<string, unknown> = {
    url: params.url,
    formats: ["markdown"],
    onlyMainContent: params.onlyMainContent,
    timeout: params.timeoutSeconds * 1000,
    maxAge: params.maxAgeMs,
    proxy: params.proxy,
    storeInCache: params.storeInCache,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  const payload = (await res.json()) as {
    success?: boolean;
    data?: {
      markdown?: string;
      content?: string;
      metadata?: {
        title?: string;
        sourceURL?: string;
        statusCode?: number;
      };
    };
    warning?: string;
    error?: string;
  };

  if (!res.ok || payload?.success === false) {
    const detail = payload?.error ?? "";
    throw new Error(
      `Firecrawl fetch failed (${res.status}): ${wrapWebContent(detail || res.statusText, "web_fetch")}`.trim(),
    );
  }

  const data = payload?.data ?? {};
  const rawText =
    typeof data.markdown === "string"
      ? data.markdown
      : typeof data.content === "string"
        ? data.content
        : "";
  const text = params.extractMode === "text" ? markdownToText(rawText) : rawText;
  return {
    text,
    title: data.metadata?.title,
    finalUrl: data.metadata?.sourceURL,
    status: data.metadata?.statusCode,
    warning: payload?.warning,
  };
}

type FirecrawlRuntimeParams = {
  firecrawlEnabled: boolean;
  firecrawlApiKey?: string;
  firecrawlBaseUrl: string;
  firecrawlOnlyMainContent: boolean;
  firecrawlMaxAgeMs: number;
  firecrawlProxy: "auto" | "basic" | "stealth";
  firecrawlStoreInCache: boolean;
  firecrawlTimeoutSeconds: number;
};

type WebFetchRuntimeParams = FirecrawlRuntimeParams & {
  url: string;
  extractMode: ExtractMode;
  maxChars: number;
  maxResponseBytes: number;
  maxRedirects: number;
  timeoutSeconds: number;
  cacheTtlMs: number;
  userAgent: string;
  readabilityEnabled: boolean;
  autoEscalation: boolean;
  maxBlockRetries: number;
  scraplingAvailable: boolean;
  tlsEngineAvailable: boolean;
  camoufoxAvailable: boolean;
  proxyPool: ProxyPool;
};

function toFirecrawlContentParams(
  params: FirecrawlRuntimeParams & { url: string; extractMode: ExtractMode },
): Parameters<typeof fetchFirecrawlContent>[0] | null {
  if (!params.firecrawlEnabled || !params.firecrawlApiKey) {
    return null;
  }
  return {
    url: params.url,
    extractMode: params.extractMode,
    apiKey: params.firecrawlApiKey,
    baseUrl: params.firecrawlBaseUrl,
    onlyMainContent: params.firecrawlOnlyMainContent,
    maxAgeMs: params.firecrawlMaxAgeMs,
    proxy: params.firecrawlProxy,
    storeInCache: params.firecrawlStoreInCache,
    timeoutSeconds: params.firecrawlTimeoutSeconds,
  };
}

async function maybeFetchFirecrawlWebFetchPayload(
  params: WebFetchRuntimeParams & {
    urlToFetch: string;
    finalUrlFallback: string;
    statusFallback: number;
    cacheKey: string;
    tookMs: number;
  },
): Promise<Record<string, unknown> | null> {
  const firecrawlParams = toFirecrawlContentParams({
    ...params,
    url: params.urlToFetch,
    extractMode: params.extractMode,
  });
  if (!firecrawlParams) {
    return null;
  }

  const firecrawl = await fetchFirecrawlContent(firecrawlParams);
  const payload = buildFirecrawlWebFetchPayload({
    firecrawl,
    rawUrl: params.url,
    finalUrlFallback: params.finalUrlFallback,
    statusFallback: params.statusFallback,
    extractMode: params.extractMode,
    maxChars: params.maxChars,
    tookMs: params.tookMs,
  });
  writeCache(FETCH_CACHE, params.cacheKey, payload, params.cacheTtlMs);
  return payload;
}

async function runWebFetch(params: WebFetchRuntimeParams): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    `fetch:${params.url}:${params.extractMode}:${params.maxChars}`,
  );
  const cached = readCache(FETCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.url);
  } catch {
    throw new Error("Invalid URL: must be http or https");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Invalid URL: must be http or https");
  }

  // Per-domain rate limiting
  await domainRateLimiter.waitForSlot(extractDomain(params.url));

  // Crawl session pacing: pre-fetch delay (human-like page turn wait)
  const crawlSession = getActiveCrawlSession();
  if (crawlSession && !crawlSession.pacer.isAborted()) {
    await crawlSession.pacer.beforePageTurn();

    // Session warmup: visit homepage before first real fetch on anti-bot domains
    if (!crawlSession.warmedUp) {
      try {
        const hostname = new URL(params.url).hostname;
        const domainProfile = matchDomainProfile(hostname);
        if (domainProfile?.warmupPath) {
          const baseUrl = `${new URL(params.url).protocol}//${hostname}`;
          const warmupOk = await performSessionWarmup({
            baseUrl,
            warmupPath: domainProfile.warmupPath,
            cookieJar: crawlSession.cookieJar,
            identity: crawlSession.identity,
          });
          if (warmupOk) {
            crawlSession.recordNavigation(`${baseUrl}${domainProfile.warmupPath}`);
          }
        }
      } catch {
        // Warmup is best-effort
      }
      crawlSession.warmedUp = true;
    }
  }

  const start = Date.now();

  let result: Record<string, unknown>;

  // If auto-escalation is enabled, run through the escalation chain
  if (params.autoEscalation) {
    result = await runWebFetchWithEscalation(params, cacheKey, start);
  } else {
    // Legacy path: no escalation
    result = await runWebFetchDirect(params, cacheKey, start);
  }

  // Record navigation and capture cookies from response
  if (crawlSession && !crawlSession.pacer.isAborted()) {
    crawlSession.recordNavigation(params.url);
  }

  // Crawl session pacing: post-fetch processing
  if (crawlSession && !crawlSession.pacer.isAborted()) {
    const status = typeof result.status === "number" ? result.status : 200;
    const body = typeof result.text === "string" ? result.text : "";

    // Anomaly detection on the fetched page
    const anomaly = await crawlSession.pacer.afterPageLoad({
      status,
      body,
      loadTimeMs: typeof result.tookMs === "number" ? result.tookMs : undefined,
      url: params.url,
    });

    if (anomaly.detected) {
      result.crawlAnomaly = {
        type: anomaly.type,
        severity: anomaly.severity,
        reason: anomaly.reason,
      };
    }

    if (crawlSession.pacer.isAborted()) {
      result.crawlSessionAborted = true;
      result.crawlAbortReason = `Session aborted due to repeated anomalies`;
    } else {
      // Simulate reading the page
      await crawlSession.pacer.simulateReading();

      // Occasionally click detail (randomized)
      await crawlSession.pacer.maybeClickDetail();

      // Record one item fetched
      crawlSession.pacer.recordItems(1);

      // Batch rest if needed
      if (crawlSession.pacer.shouldRestBatch()) {
        logDebug("[web-fetch] Crawl session batch rest triggered");
        await crawlSession.pacer.batchRest();
      }

      // Session limit check
      if (crawlSession.pacer.hasReachedSessionLimit()) {
        result.crawlSessionLimitReached = true;
        result.crawlMessage = `Session item limit (${crawlSession.profile.maxItemsPerSession}) reached. Stop and start a new session.`;
      }
    }

    // Attach crawl session info
    result.crawlSession = {
      id: crawlSession.id,
      itemsFetched: crawlSession.pacer.getState().itemsFetched,
      batchNumber: crawlSession.pacer.getState().batchNumber,
      profile: crawlSession.profile.name,
    };
  }

  return result;
}

/** Direct fetch path (legacy, no escalation). */
async function runWebFetchDirect(
  params: WebFetchRuntimeParams,
  cacheKey: string,
  start: number,
): Promise<Record<string, unknown>> {
  let res: Response;
  let release: (() => Promise<void>) | null = null;
  let finalUrl = params.url;
  const headers = buildBrowserHeaders({
    userAgent: params.userAgent,
    acceptMarkdown: true,
  });
  try {
    const result = await fetchWithWebToolsNetworkGuard({
      url: params.url,
      maxRedirects: params.maxRedirects,
      timeoutSeconds: params.timeoutSeconds,
      init: { headers },
    });
    res = result.response;
    finalUrl = result.finalUrl;
    release = result.release;
    logCfMarkdownTokens(res, finalUrl);
  } catch (error) {
    if (error instanceof SsrFBlockedError) {
      throw error;
    }
    const payload = await maybeFetchFirecrawlWebFetchPayload({
      ...params,
      urlToFetch: finalUrl,
      finalUrlFallback: finalUrl,
      statusFallback: 200,
      cacheKey,
      tookMs: Date.now() - start,
    });
    if (payload) {
      return payload;
    }
    throw error;
  }

  try {
    return await processDirectResponse(params, res, finalUrl, cacheKey, start);
  } finally {
    if (release) {
      await release();
    }
  }
}

/** Fetch with automatic anti-bot escalation. */
async function runWebFetchWithEscalation(
  params: WebFetchRuntimeParams,
  cacheKey: string,
  start: number,
): Promise<Record<string, unknown>> {
  const firecrawlAvailable = params.firecrawlEnabled && Boolean(params.firecrawlApiKey);

  // Build session state for anti-detection if a crawl session is active
  const activeCrawlSession = getActiveCrawlSession();
  const sessionState = activeCrawlSession
    ? {
        cookieJar: activeCrawlSession.cookieJar,
        identity: activeCrawlSession.identity,
        navigationHistory: activeCrawlSession.navigationHistory,
      }
    : undefined;

  const escalationResult = await runWithEscalation({
    url: params.url,
    maxChars: params.maxChars,
    config: {
      maxBlockRetries: params.maxBlockRetries,
      scraplingAvailable: params.scraplingAvailable,
      firecrawlAvailable,
      tlsEngineAvailable: params.tlsEngineAvailable,
      camoufoxAvailable: params.camoufoxAvailable,
      proxyPool: params.proxyPool.size > 0 ? params.proxyPool : undefined,
    },
    sessionState,
    directFetch: async ({ headers: escalationHeaders }) => {
      // Use session identity headers if available, otherwise standard random UA
      const baseHeaders = activeCrawlSession
        ? activeCrawlSession.getHeaders(params.url, { acceptMarkdown: true })
        : buildBrowserHeaders({ userAgent: params.userAgent, acceptMarkdown: true });
      const mergedHeaders = {
        ...baseHeaders,
        ...escalationHeaders,
      };
      const result = await fetchWithWebToolsNetworkGuard({
        url: params.url,
        maxRedirects: params.maxRedirects,
        timeoutSeconds: params.timeoutSeconds,
        init: { headers: mergedHeaders },
      });
      logCfMarkdownTokens(result.response, result.finalUrl);
      const bodyResult = await readResponseText(result.response, {
        maxBytes: params.maxResponseBytes,
      });
      await result.release();
      return {
        status: result.response.status,
        headers: result.response.headers,
        body: bodyResult.text,
        contentType: result.response.headers.get("content-type") ?? undefined,
      };
    },
    firecrawlFallback: async () => {
      return await maybeFetchFirecrawlWebFetchPayload({
        ...params,
        urlToFetch: params.url,
        finalUrlFallback: params.url,
        statusFallback: 200,
        cacheKey,
        tookMs: Date.now() - start,
      });
    },
  });

  const escalationPath = escalationResult.escalationPath;

  if (escalationResult.type === "firecrawl") {
    return { ...escalationResult.payload, escalationPath };
  }

  if (escalationResult.type === "scrapling") {
    // Build a standard payload from scrapling text
    const wrapped = wrapWebFetchContent(escalationResult.text, params.maxChars);
    const payload: Record<string, unknown> = {
      url: params.url,
      finalUrl: params.url,
      status: escalationResult.status,
      contentType: "text/plain",
      extractMode: params.extractMode,
      extractor: `scrapling-${escalationResult.mode}`,
      externalContent: { untrusted: true, source: "web_fetch", wrapped: true },
      truncated: wrapped.truncated,
      length: wrapped.wrappedLength,
      rawLength: wrapped.rawLength,
      wrappedLength: wrapped.wrappedLength,
      fetchedAt: new Date().toISOString(),
      tookMs: Date.now() - start,
      text: wrapped.text,
      escalationPath,
    };
    writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (escalationResult.type === "tls_impersonate") {
    const wrapped = wrapWebFetchContent(escalationResult.body, params.maxChars);
    const payload: Record<string, unknown> = {
      url: params.url,
      finalUrl: params.url,
      status: escalationResult.status,
      contentType: "text/html",
      extractMode: params.extractMode,
      extractor: "tls-impersonate",
      externalContent: { untrusted: true, source: "web_fetch", wrapped: true },
      truncated: wrapped.truncated,
      length: wrapped.wrappedLength,
      rawLength: wrapped.rawLength,
      wrappedLength: wrapped.wrappedLength,
      fetchedAt: new Date().toISOString(),
      tookMs: Date.now() - start,
      text: wrapped.text,
      escalationPath,
    };
    writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (escalationResult.type === "camoufox") {
    const wrapped = wrapWebFetchContent(escalationResult.text, params.maxChars);
    const payload: Record<string, unknown> = {
      url: params.url,
      finalUrl: params.url,
      status: escalationResult.status,
      contentType: "text/html",
      extractMode: params.extractMode,
      extractor: "camoufox-stealth",
      externalContent: { untrusted: true, source: "web_fetch", wrapped: true },
      truncated: wrapped.truncated,
      length: wrapped.wrappedLength,
      rawLength: wrapped.rawLength,
      wrappedLength: wrapped.wrappedLength,
      fetchedAt: new Date().toISOString(),
      tookMs: Date.now() - start,
      text: wrapped.text,
      escalationPath,
    };
    writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  // type === "direct" — process the successful direct response body
  const { status, headers: _resHeaders, body, contentType: rawContentType } = escalationResult;
  const contentType = rawContentType ?? "application/octet-stream";
  const normalizedContentType = normalizeContentType(contentType) ?? "application/octet-stream";

  // Check for non-ok status that wasn't caught by escalation (shouldn't happen often)
  if (status >= 400) {
    const detail = formatWebFetchErrorDetail({
      detail: body,
      contentType,
      maxChars: DEFAULT_ERROR_MAX_CHARS,
    });
    const wrappedDetail = wrapWebFetchContent(detail || String(status), DEFAULT_ERROR_MAX_CHARS);
    throw new Error(`Web fetch failed (${status}): ${wrappedDetail.text}`);
  }

  return buildSuccessPayload({
    params,
    body,
    contentType,
    normalizedContentType,
    finalUrl: params.url,
    status,
    cacheKey,
    start,
    escalationPath,
    responseTruncated: false,
  });
}

/** Extract content and build the standard success payload. */
async function buildSuccessPayload(args: {
  params: WebFetchRuntimeParams;
  body: string;
  contentType: string;
  normalizedContentType: string;
  finalUrl: string;
  status: number;
  cacheKey: string;
  start: number;
  escalationPath?: EscalationStep[];
  responseTruncated: boolean;
}): Promise<Record<string, unknown>> {
  const {
    params,
    body,
    contentType,
    normalizedContentType,
    finalUrl,
    status,
    cacheKey,
    start,
    escalationPath,
    responseTruncated,
  } = args;
  const responseTruncatedWarning = responseTruncated
    ? `Response body truncated after ${params.maxResponseBytes} bytes.`
    : undefined;

  let title: string | undefined;
  let extractor = "raw";
  let text = body;
  if (contentType.includes("text/markdown")) {
    extractor = "cf-markdown";
    if (params.extractMode === "text") {
      text = markdownToText(body);
    }
  } else if (contentType.includes("text/html")) {
    if (params.readabilityEnabled) {
      const readable = await extractReadableContent({
        html: body,
        url: finalUrl,
        extractMode: params.extractMode,
      });
      if (readable?.text) {
        text = readable.text;
        title = readable.title;
        extractor = "readability";
      } else {
        const firecrawl = await tryFirecrawlFallback({ ...params, url: finalUrl });
        if (firecrawl) {
          text = firecrawl.text;
          title = firecrawl.title;
          extractor = "firecrawl";
        } else {
          throw new Error(
            "Web fetch extraction failed: Readability and Firecrawl returned no content.",
          );
        }
      }
    } else {
      throw new Error(
        "Web fetch extraction failed: Readability disabled and Firecrawl unavailable.",
      );
    }
  } else if (contentType.includes("application/json")) {
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
      extractor = "json";
    } catch {
      text = body;
      extractor = "raw";
    }
  }

  const wrapped = wrapWebFetchContent(text, params.maxChars);
  const wrappedTitle = title ? wrapWebFetchField(title) : undefined;
  const wrappedWarning = wrapWebFetchField(responseTruncatedWarning);
  const payload: Record<string, unknown> = {
    url: params.url,
    finalUrl,
    status,
    contentType: normalizedContentType,
    title: wrappedTitle,
    extractMode: params.extractMode,
    extractor,
    externalContent: { untrusted: true, source: "web_fetch", wrapped: true },
    truncated: wrapped.truncated,
    length: wrapped.wrappedLength,
    rawLength: wrapped.rawLength,
    wrappedLength: wrapped.wrappedLength,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - start,
    text: wrapped.text,
    warning: wrappedWarning,
  };
  if (escalationPath?.length) {
    payload.escalationPath = escalationPath;
  }
  writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs);
  return payload;
}

/** Process a direct (non-escalated) Response into a standard payload. */
async function processDirectResponse(
  params: WebFetchRuntimeParams,
  res: Response,
  finalUrl: string,
  cacheKey: string,
  start: number,
): Promise<Record<string, unknown>> {
  if (!res.ok) {
    const payload = await maybeFetchFirecrawlWebFetchPayload({
      ...params,
      urlToFetch: params.url,
      finalUrlFallback: finalUrl,
      statusFallback: res.status,
      cacheKey,
      tookMs: Date.now() - start,
    });
    if (payload) {
      return payload;
    }
    const rawDetailResult = await readResponseText(res, { maxBytes: DEFAULT_ERROR_MAX_BYTES });
    const detail = formatWebFetchErrorDetail({
      detail: rawDetailResult.text,
      contentType: res.headers.get("content-type"),
      maxChars: DEFAULT_ERROR_MAX_CHARS,
    });
    const wrappedDetail = wrapWebFetchContent(detail || res.statusText, DEFAULT_ERROR_MAX_CHARS);
    throw new Error(`Web fetch failed (${res.status}): ${wrappedDetail.text}`);
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const normalizedContentType = normalizeContentType(contentType) ?? "application/octet-stream";
  const bodyResult = await readResponseText(res, { maxBytes: params.maxResponseBytes });

  return buildSuccessPayload({
    params,
    body: bodyResult.text,
    contentType,
    normalizedContentType,
    finalUrl,
    status: res.status,
    cacheKey,
    start,
    responseTruncated: bodyResult.truncated,
  });
}

function logCfMarkdownTokens(res: Response, finalUrl: string): void {
  const markdownTokens = res.headers.get("x-markdown-tokens");
  if (markdownTokens) {
    logDebug(
      `[web-fetch] x-markdown-tokens: ${markdownTokens} (${redactUrlForDebugLog(finalUrl)})`,
    );
  }
}

async function tryFirecrawlFallback(
  params: FirecrawlRuntimeParams & { url: string; extractMode: ExtractMode },
): Promise<{ text: string; title?: string } | null> {
  const firecrawlParams = toFirecrawlContentParams(params);
  if (!firecrawlParams) {
    return null;
  }
  try {
    const firecrawl = await fetchFirecrawlContent(firecrawlParams);
    return { text: firecrawl.text, title: firecrawl.title };
  } catch {
    return null;
  }
}

function resolveFirecrawlEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return `${DEFAULT_FIRECRAWL_BASE_URL}/v2/scrape`;
  }
  try {
    const url = new URL(trimmed);
    if (url.pathname && url.pathname !== "/") {
      return url.toString();
    }
    url.pathname = "/v2/scrape";
    return url.toString();
  } catch {
    return `${DEFAULT_FIRECRAWL_BASE_URL}/v2/scrape`;
  }
}

export function createWebFetchTool(options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
  runtimeFirecrawl?: RuntimeWebFetchFirecrawlMetadata;
}): AnyAgentTool | null {
  const fetch = resolveFetchConfig(options?.config);
  if (!resolveFetchEnabled({ fetch, sandboxed: options?.sandboxed })) {
    return null;
  }
  const readabilityEnabled = resolveFetchReadabilityEnabled(fetch);
  const firecrawl = resolveFirecrawlConfig(fetch);
  const runtimeFirecrawlActive = options?.runtimeFirecrawl?.active;
  const shouldResolveFirecrawlApiKey =
    runtimeFirecrawlActive === undefined ? firecrawl?.enabled !== false : runtimeFirecrawlActive;
  const firecrawlApiKey = shouldResolveFirecrawlApiKey
    ? resolveFirecrawlApiKey(firecrawl)
    : undefined;
  const firecrawlEnabled =
    runtimeFirecrawlActive ?? resolveFirecrawlEnabled({ firecrawl, apiKey: firecrawlApiKey });
  const firecrawlBaseUrl = resolveFirecrawlBaseUrl(firecrawl);
  const firecrawlOnlyMainContent = resolveFirecrawlOnlyMainContent(firecrawl);
  const firecrawlMaxAgeMs = resolveFirecrawlMaxAgeMsOrDefault(firecrawl);
  const firecrawlTimeoutSeconds = resolveTimeoutSeconds(
    firecrawl?.timeoutSeconds ?? fetch?.timeoutSeconds,
    DEFAULT_TIMEOUT_SECONDS,
  );
  const userAgent =
    (fetch && "userAgent" in fetch && typeof fetch.userAgent === "string" && fetch.userAgent) ||
    pickUserAgent();
  const maxResponseBytes = resolveFetchMaxResponseBytes(fetch);

  // Anti-bot escalation config
  const autoEscalation = fetch?.autoEscalation !== false;
  const maxBlockRetries =
    typeof fetch?.maxBlockRetries === "number" ? Math.max(0, fetch.maxBlockRetries) : 2;

  // Reconfigure domain rate limiter if custom settings provided
  if (fetch?.rateLimitMaxRequests || fetch?.rateLimitWindowMs) {
    domainRateLimiter = createDomainRateLimiter({
      maxRequests: fetch.rateLimitMaxRequests,
      windowMs: fetch.rateLimitWindowMs,
    });
  }

  // Check tool availability once (cached)
  let scraplingAvailable = false;
  let tlsEngineAvailable = false;
  let camoufoxAvailable = false;
  const availabilityChecks = autoEscalation
    ? Promise.all([
        isScraplingInstalled().then((v) => {
          scraplingAvailable = v;
        }),
        isCurlCffiInstalled().then((v) => {
          tlsEngineAvailable = v;
        }),
        isCamoufoxInstalled().then((v) => {
          camoufoxAvailable = v;
        }),
      ])
    : Promise.resolve();

  // Create a singleton proxy pool (domain-affinity strategy)
  const proxyPool = createProxyPool({ strategy: "domain-affinity" });

  return {
    label: "Web Fetch",
    name: "web_fetch",
    description:
      "Fetch and extract readable content from a URL (HTML → markdown/text). Use for lightweight page access without browser automation. Automatically bypasses anti-bot protections when detected.",
    parameters: WebFetchSchema,
    execute: async (_toolCallId, args) => {
      await availabilityChecks;
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });
      const extractMode = readStringParam(params, "extractMode") === "text" ? "text" : "markdown";
      const maxChars = readNumberParam(params, "maxChars", { integer: true });
      const maxCharsCap = resolveFetchMaxCharsCap(fetch);
      const result = await runWebFetch({
        url,
        extractMode,
        maxChars: resolveMaxChars(
          maxChars ?? fetch?.maxChars,
          DEFAULT_FETCH_MAX_CHARS,
          maxCharsCap,
        ),
        maxResponseBytes,
        maxRedirects: resolveMaxRedirects(fetch?.maxRedirects, DEFAULT_FETCH_MAX_REDIRECTS),
        timeoutSeconds: resolveTimeoutSeconds(fetch?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
        cacheTtlMs: resolveCacheTtlMs(fetch?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
        userAgent,
        readabilityEnabled,
        firecrawlEnabled,
        firecrawlApiKey,
        firecrawlBaseUrl,
        firecrawlOnlyMainContent,
        firecrawlMaxAgeMs,
        firecrawlProxy: "auto",
        firecrawlStoreInCache: true,
        firecrawlTimeoutSeconds,
        autoEscalation,
        maxBlockRetries,
        scraplingAvailable,
        tlsEngineAvailable,
        camoufoxAvailable,
        proxyPool,
      });
      return jsonResult(result);
    },
  };
}
