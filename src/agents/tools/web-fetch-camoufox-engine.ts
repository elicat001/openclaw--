/**
 * Camoufox engine -- a Python subprocess wrapper for the Camoufox
 * anti-detect Firefox browser.  Provides the highest stealth level
 * (C++-level fingerprint masking, humanised mouse movements).
 */

import { execFile } from "node:child_process";
import { extendedPythonPath } from "../../agent-reach/extended-path.js";
import { runPython } from "./scrapling-tool.js";
import type { CookieEntry } from "./web-fetch-cookie-jar.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CamoufoxResult = {
  text: string;
  status: number;
  title?: string;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
};

export type CamoufoxParams = {
  url: string;
  cookies?: CookieEntry[];
  viewport?: { width: number; height: number };
  proxy?: string;
  timeout?: number;
  waitSelector?: string;
  humanize?: boolean;
  maxChars?: number;
};

// ---------------------------------------------------------------------------
// Embedded Python script
// ---------------------------------------------------------------------------

const CAMOUFOX_SCRIPT = `
import json, sys, warnings
warnings.filterwarnings("ignore")

params = json.loads(sys.stdin.read())
url = params["url"]
timeout = params.get("timeout", 60)
max_chars = params.get("maxChars", 50000)
proxy = params.get("proxy")
viewport = params.get("viewport", {"width": 1920, "height": 1080})
wait_selector = params.get("waitSelector")
humanize = params.get("humanize", True)
input_cookies = params.get("cookies", [])

from camoufox.sync_api import Camoufox

proxy_kw = {}
if proxy:
    proxy_kw["proxy"] = {"server": proxy}

with Camoufox(headless=True, humanize=humanize, **proxy_kw) as browser:
    context = browser.new_context(
        viewport={"width": viewport["width"], "height": viewport["height"]}
    )

    # Inject cookies
    if input_cookies:
        cookie_list = []
        for c in input_cookies:
            cookie_list.append({
                "name": c["name"],
                "value": c["value"],
                "domain": c.get("domain", ""),
                "path": c.get("path", "/"),
            })
        context.add_cookies(cookie_list)

    page = context.new_page()

    try:
        resp = page.goto(url, timeout=timeout * 1000, wait_until="domcontentloaded")
        status = resp.status if resp else 0
    except Exception as e:
        status = 0

    if wait_selector:
        try:
            page.wait_for_selector(wait_selector, timeout=15000)
        except Exception:
            pass

    # Small delay for dynamic content
    page.wait_for_timeout(2000)

    text = page.content()
    title = page.title()

    # Extract cookies from browser context
    out_cookies = []
    try:
        browser_cookies = context.cookies()
        for c in browser_cookies:
            out_cookies.append({
                "name": c.get("name", ""),
                "value": c.get("value", ""),
                "domain": c.get("domain", ""),
                "path": c.get("path", "/"),
            })
    except Exception:
        pass

if len(text) > max_chars:
    text = text[:max_chars]

print(json.dumps({
    "status": status,
    "text": text,
    "title": title,
    "cookies": out_cookies,
}, ensure_ascii=False))
`;

// ---------------------------------------------------------------------------
// Local helper: runPython with configurable timeout
// ---------------------------------------------------------------------------

const CAMOUFOX_TIMEOUT_MS = 90_000;

function runPythonWithTimeout(
  script: string,
  stdinData: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: extendedPythonPath() };
    const child = execFile(
      "python3",
      ["-c", script],
      { timeout: timeoutMs, env, maxBuffer: 10_000_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    if (stdinData && child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function fetchWithCamoufox(params: CamoufoxParams): Promise<CamoufoxResult | null> {
  const stdinPayload = JSON.stringify({
    url: params.url,
    cookies: params.cookies?.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
    })),
    viewport: params.viewport,
    proxy: params.proxy,
    timeout: params.timeout ?? 60,
    waitSelector: params.waitSelector,
    humanize: params.humanize ?? true,
    maxChars: params.maxChars ?? 50_000,
  });

  try {
    const { stdout } = await runPythonWithTimeout(
      CAMOUFOX_SCRIPT,
      stdinPayload,
      CAMOUFOX_TIMEOUT_MS,
    );
    return JSON.parse(stdout.trim()) as CamoufoxResult;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

let camoufoxInstalledCache: boolean | undefined;

export async function isCamoufoxInstalled(): Promise<boolean> {
  if (camoufoxInstalledCache !== undefined) {
    return camoufoxInstalledCache;
  }
  try {
    await runPython('import camoufox; print("ok")');
    camoufoxInstalledCache = true;
  } catch {
    camoufoxInstalledCache = false;
  }
  return camoufoxInstalledCache;
}
