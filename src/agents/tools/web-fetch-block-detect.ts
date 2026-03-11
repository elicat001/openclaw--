/**
 * Anti-bot block detection engine.
 * Detects when a response is a challenge/block page rather than real content,
 * and suggests an appropriate escalation strategy.
 */

export type BlockReason =
  | "cloudflare_challenge"
  | "captcha"
  | "access_denied"
  | "rate_limited"
  | "waf_block"
  | "empty_response";

export type EscalationSuggestion =
  | "retry_with_new_headers"
  | "tls_impersonate"
  | "camoufox_stealth"
  | "scrapling_fast"
  | "scrapling_stealth";

export type BlockDetectionResult = {
  blocked: boolean;
  reason?: BlockReason;
  retryable: boolean;
  suggestedEscalation?: EscalationSuggestion;
};

const NOT_BLOCKED: BlockDetectionResult = { blocked: false, retryable: false };

// --- Cloudflare challenge detection ---

const CF_CHALLENGE_MARKERS = [
  "cf-browser-verification",
  "cf_chl_opt",
  "challenge-platform",
  "__cf_chl_managed_tk__",
  "Checking if the site connection is secure",
  "Just a moment...",
  "cf-challenge-running",
  "cf_clearance",
] as const;

const CF_ERROR_CODES = new Set([521, 522, 523, 524, 525, 526, 530]);

// --- CAPTCHA detection ---

const CAPTCHA_MARKERS = [
  "g-recaptcha",
  "h-captcha",
  "hcaptcha",
  "cf-turnstile",
  "recaptcha/api",
  "hcaptcha.com/1/api",
  "challenges.cloudflare.com/turnstile",
] as const;

// --- WAF / generic block detection ---

const WAF_BLOCK_MARKERS = [
  "Attention Required",
  "Sorry, you have been blocked",
  "Security check",
  "Blocked by",
  "Request blocked",
  "This request was blocked by the security rules",
] as const;

const ACCESS_DENIED_MARKERS = [
  "Access Denied",
  "403 Forbidden",
  "You don't have permission",
  "not authorized",
  "Access to this page has been denied",
] as const;

function bodyContainsAny(body: string, markers: readonly string[]): boolean {
  const lower = body.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

function hasCfRayHeader(headers: Headers): boolean {
  return headers.has("cf-ray");
}

function detectCloudflareChallenge(params: {
  status: number;
  headers: Headers;
  body: string;
}): boolean {
  const { status, headers, body } = params;
  // Cloudflare challenge pages: 403/503 with cf-ray header and challenge markers in body
  if ((status === 403 || status === 503) && hasCfRayHeader(headers)) {
    if (bodyContainsAny(body, CF_CHALLENGE_MARKERS)) {
      return true;
    }
  }
  // Cloudflare error codes
  if (CF_ERROR_CODES.has(status) && hasCfRayHeader(headers)) {
    return true;
  }
  // 200 with challenge markers (some CF configs serve 200 with JS challenge)
  if (status === 200 && bodyContainsAny(body, CF_CHALLENGE_MARKERS) && body.length < 20_000) {
    return true;
  }
  return false;
}

function detectCaptcha(body: string): boolean {
  return bodyContainsAny(body, CAPTCHA_MARKERS);
}

function detectWafBlock(params: { status: number; body: string }): boolean {
  const { status, body } = params;
  if (status !== 403 && status !== 406 && status !== 418) {
    return false;
  }
  if (body.length > 50_000) {
    return false;
  } // Real pages are usually larger
  return bodyContainsAny(body, WAF_BLOCK_MARKERS);
}

function detectAccessDenied(params: { status: number; body: string }): boolean {
  const { status, body } = params;
  if (status !== 403) {
    return false;
  }
  if (body.length > 10_000) {
    return false;
  } // Block pages are typically short
  return bodyContainsAny(body, ACCESS_DENIED_MARKERS);
}

function detectEmptyResponse(params: {
  status: number;
  body: string;
  contentType?: string;
}): boolean {
  if (params.status !== 200) {
    return false;
  }
  // JSON APIs can legitimately return short responses
  if (params.contentType?.includes("application/json")) {
    return false;
  }
  return params.body.trim().length < 100;
}

/**
 * Detect whether a response is a block/challenge page.
 * Works on both error responses (4xx/5xx) and 200 OK responses
 * (many anti-bot systems serve challenge pages with 200 status).
 */
export function detectBlock(params: {
  status: number;
  headers: Headers;
  body: string;
  url: string;
  contentType?: string;
}): BlockDetectionResult {
  const { status, headers, body } = params;

  // Rate limited
  if (status === 429) {
    return {
      blocked: true,
      reason: "rate_limited",
      retryable: true,
      suggestedEscalation: "retry_with_new_headers",
    };
  }

  // Cloudflare challenge
  if (detectCloudflareChallenge({ status, headers, body })) {
    return {
      blocked: true,
      reason: "cloudflare_challenge",
      retryable: true,
      suggestedEscalation: "scrapling_stealth",
    };
  }

  // CAPTCHA
  if (detectCaptcha(body) && body.length < 30_000) {
    return {
      blocked: true,
      reason: "captcha",
      retryable: true,
      suggestedEscalation: "scrapling_stealth",
    };
  }

  // WAF block — try TLS impersonation first (faster than browser engines)
  if (detectWafBlock({ status, body })) {
    return {
      blocked: true,
      reason: "waf_block",
      retryable: true,
      suggestedEscalation: "tls_impersonate",
    };
  }

  // Access denied — try TLS impersonation first
  if (detectAccessDenied({ status, body })) {
    return {
      blocked: true,
      reason: "access_denied",
      retryable: true,
      suggestedEscalation: "tls_impersonate",
    };
  }

  // Empty response on 200
  if (detectEmptyResponse({ status, body, contentType: params.contentType })) {
    return {
      blocked: true,
      reason: "empty_response",
      retryable: true,
      suggestedEscalation: "retry_with_new_headers",
    };
  }

  // Transient server errors (502, 503) that might be anti-bot
  if ((status === 502 || status === 503) && body.length < 5_000) {
    return {
      blocked: true,
      reason: "waf_block",
      retryable: true,
      suggestedEscalation: "retry_with_new_headers",
    };
  }

  return NOT_BLOCKED;
}

/**
 * Parse the Retry-After header value into milliseconds.
 * Supports both delta-seconds (e.g., "120") and HTTP-date formats.
 */
export function extractRetryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) {
    return undefined;
  }

  // Try delta-seconds first
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  // Try HTTP-date
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    const deltaMs = dateMs - Date.now();
    return deltaMs > 0 ? deltaMs : 0;
  }

  return undefined;
}

/** Check whether the HTTP status is retryable (transient server/anti-bot errors). */
export function isRetryableStatus(status: number): boolean {
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (status >= 520 && status <= 530) {
    return true;
  } // Cloudflare
  return false;
}
