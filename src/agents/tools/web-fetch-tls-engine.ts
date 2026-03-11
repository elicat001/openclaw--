/**
 * Python subprocess wrapper for curl_cffi that provides TLS-impersonated
 * HTTP requests. Perfectly replicates Chrome/Firefox/Safari TLS handshakes
 * and HTTP/2 SETTINGS frames via curl_cffi's impersonation engine.
 */

import { runPython } from "./scrapling-tool.js";
import type { BrowserIdentity } from "./web-fetch-headers.js";

// ── Types ────────────────────────────────────────────────────────

export type TlsEngineResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
};

export type TlsImpersonateParams = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Cookie header string, e.g. "sid=abc; token=xyz" */
  cookies?: string;
  /** Proxy URL, e.g. http://user:pass@host:port */
  proxy?: string;
  /** curl_cffi impersonation profile, e.g. "chrome131", "firefox132" */
  impersonate?: string;
  /** Request timeout in seconds (default 30) */
  timeout?: number;
  /** Maximum response body length in characters */
  maxBytes?: number;
};

// ── Impersonation profiles ───────────────────────────────────────

const IMPERSONATE_PROFILES = [
  "chrome131",
  "chrome130",
  "chrome129",
  "chrome128",
  "chrome127",
  "chrome126",
  "chrome125",
  "chrome124",
  "firefox132",
  "firefox131",
  "firefox130",
  "safari17.6",
  "safari17.5",
  "edge131",
  "edge130",
] as const;

/**
 * Pick an impersonation profile matching the given browser identity, or
 * return a random profile from the pool when no identity is provided.
 */
export function pickImpersonateProfile(identity?: BrowserIdentity): string {
  if (identity) {
    const family = identity.browserFamily; // "chrome" | "firefox" | "safari"
    const version = identity.browserVersion; // e.g. "131.0.0.0"
    const majorVersion = version.split(".")[0];

    // For safari, profiles use dotted minor versions like "safari17.6"
    const prefix = family === "safari" ? `safari${majorVersion}.` : family;

    // Try exact major-version match first
    const exactMatch = IMPERSONATE_PROFILES.find((p) => {
      if (family === "safari") {
        return p.startsWith(`safari${majorVersion}`);
      }
      return p === `${prefix}${majorVersion}`;
    });
    if (exactMatch) {
      return exactMatch;
    }

    // Fall back to any profile from the same browser family
    const familyPrefix = family === "safari" ? "safari" : family;
    const familyMatches = IMPERSONATE_PROFILES.filter((p) => p.startsWith(familyPrefix));
    if (familyMatches.length > 0) {
      return familyMatches[Math.floor(Math.random() * familyMatches.length)];
    }
  }

  // Random from the full pool
  return IMPERSONATE_PROFILES[Math.floor(Math.random() * IMPERSONATE_PROFILES.length)];
}

// ── Embedded Python script ───────────────────────────────────────

/**
 * Python script that reads TLS fetch parameters from stdin as JSON.
 * Uses curl_cffi to perform the request with browser TLS impersonation.
 */
const TLS_ENGINE_SCRIPT = `
import json, sys, warnings
warnings.filterwarnings("ignore")

params = json.loads(sys.stdin.read())
from curl_cffi.requests import Session

impersonate = params.get("impersonate", "chrome131")
timeout = params.get("timeout", 30)
max_bytes = params.get("maxBytes", 5000000)
proxy = params.get("proxy")
method = params.get("method", "GET").upper()
headers = params.get("headers", {})
cookies_str = params.get("cookies", "")

session = Session(impersonate=impersonate)

# Parse cookie string into dict
cookie_dict = {}
if cookies_str:
    for pair in cookies_str.split("; "):
        if "=" in pair:
            k, v = pair.split("=", 1)
            cookie_dict[k.strip()] = v.strip()

proxy_kw = {"proxies": {"https": proxy, "http": proxy}} if proxy else {}

resp = session.request(
    method, params["url"],
    headers=headers,
    cookies=cookie_dict,
    timeout=timeout,
    allow_redirects=True,
    **proxy_kw
)

# Extract cookies from response
out_cookies = []
for cookie in session.cookies.jar:
    out_cookies.append({
        "name": cookie.name,
        "value": cookie.value,
        "domain": cookie.domain or "",
        "path": cookie.path or "/",
    })

body = resp.text
if len(body) > max_bytes:
    body = body[:max_bytes]

resp_headers = dict(resp.headers)

print(json.dumps({
    "status": resp.status_code,
    "headers": resp_headers,
    "body": body,
    "cookies": out_cookies,
}, ensure_ascii=False))
`.trim();

// ── Main fetch function ──────────────────────────────────────────

/**
 * Perform an HTTP request using curl_cffi with TLS impersonation.
 * Returns the parsed response or `null` if the request fails.
 */
export async function fetchWithTlsImpersonation(
  params: TlsImpersonateParams,
): Promise<TlsEngineResult | null> {
  try {
    const { stdout } = await runPython(TLS_ENGINE_SCRIPT, JSON.stringify(params));
    return JSON.parse(stdout.trim()) as TlsEngineResult;
  } catch {
    return null;
  }
}

// ── Availability check ───────────────────────────────────────────

let curlCffiInstalledCache: boolean | undefined;

/**
 * Check whether the curl_cffi Python module is importable.
 * Result is cached after the first check.
 */
export async function isCurlCffiInstalled(): Promise<boolean> {
  if (curlCffiInstalledCache !== undefined) {
    return curlCffiInstalledCache;
  }
  try {
    await runPython('import curl_cffi; print("ok")');
    curlCffiInstalledCache = true;
  } catch {
    curlCffiInstalledCache = false;
  }
  return curlCffiInstalledCache;
}
