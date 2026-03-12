/**
 * Automated login engine for anti-bot platforms.
 * Uses Camoufox (anti-detect Firefox) to perform human-like form logins
 * and extract session cookies for subsequent crawling.
 */

import { execFile } from "node:child_process";
import { extendedPythonPath } from "../../agent-reach/extended-path.js";
import { logDebug } from "../../logger.js";
import type { AccountCredential } from "./web-fetch-account-pool.js";
import type { CookieEntry } from "./web-fetch-cookie-jar.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoginResult = {
  success: boolean;
  cookies: CookieEntry[];
  finalUrl: string;
  error?: string;
};

export type PlatformLoginConfig = {
  loginUrl: string;
  /** CSS selector for email/username input. */
  emailSelector: string;
  /** CSS selector for password input. */
  passwordSelector: string;
  /** CSS selector for submit button. */
  submitSelector: string;
  /** If URL does NOT contain this pattern after login, it succeeded. */
  loginUrlPattern: string;
  /** Extra wait after submit (ms). */
  postLoginWaitMs: number;
  /** Use phone field instead of email if available. */
  preferPhone?: boolean;
};

// ---------------------------------------------------------------------------
// Platform login configs
// ---------------------------------------------------------------------------

export const PLATFORM_LOGIN_CONFIGS: Record<string, PlatformLoginConfig> = {
  temu: {
    loginUrl: "https://www.temu.com/{region}/login.html",
    emailSelector:
      'input[type="text"], input[type="email"], input[name="email"], input[placeholder*="mail"], input[placeholder*="telefone"]',
    passwordSelector: 'input[type="password"]',
    submitSelector: 'button[type="submit"], button[class*="login"], button[class*="submit"]',
    loginUrlPattern: "login",
    postLoginWaitMs: 8000,
  },
  shein: {
    loginUrl: "https://{region}.shein.com/user/auth/login",
    emailSelector:
      'input[type="email"], input[type="text"], input[name="email"], input[placeholder*="mail"], input[placeholder*="e-mail"]',
    passwordSelector: 'input[type="password"]',
    submitSelector:
      'button[type="submit"], button[class*="login"], button[class*="submit"], .login-submit',
    loginUrlPattern: "login",
    postLoginWaitMs: 8000,
  },
  shopee: {
    loginUrl: "https://shopee.com.{tld}/buyer/login",
    emailSelector:
      'input[type="text"], input[name="loginKey"], input[placeholder*="Telefone"], input[placeholder*="Email"]',
    passwordSelector: 'input[type="password"]',
    submitSelector: 'button[type="submit"], button[class*="btn-solid-primary"], .btn-login',
    loginUrlPattern: "login",
    postLoginWaitMs: 10000,
    preferPhone: true,
  },
};

// Region → TLD mapping for URL templates
const REGION_TLD: Record<string, string> = {
  br: "br",
  ph: "ph",
  sg: "sg",
  my: "com.my",
  th: "co.th",
  vn: "vn",
  id: "co.id",
  tw: "tw",
};

function resolveLoginUrl(platform: string, region: string): string {
  const config = PLATFORM_LOGIN_CONFIGS[platform];
  if (!config) {
    return "";
  }

  let url = config.loginUrl;
  url = url.replace("{region}", region || "br");
  url = url.replace("{tld}", REGION_TLD[region] || region || "br");
  return url;
}

// ---------------------------------------------------------------------------
// Python login script (Camoufox-based)
// ---------------------------------------------------------------------------

const LOGIN_SCRIPT = String.raw`
import json, sys, time, warnings
warnings.filterwarnings("ignore")

params = json.loads(sys.stdin.read())
login_url = params["loginUrl"]
email = params.get("email", "")
phone = params.get("phone", "")
password = params["password"]
proxy = params.get("proxy")
email_sel = params["emailSelector"]
password_sel = params["passwordSelector"]
submit_sel = params["submitSelector"]
login_url_pattern = params["loginUrlPattern"]
post_wait = params.get("postLoginWaitMs", 8000)
prefer_phone = params.get("preferPhone", False)

from camoufox.sync_api import Camoufox

proxy_kw = {}
if proxy:
    proxy_kw["proxy"] = {"server": proxy}

with Camoufox(headless=True, humanize=True, **proxy_kw) as browser:
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        locale="pt-BR",
        timezone_id="America/Sao_Paulo",
    )
    page = context.new_page()

    # Navigate to login page
    try:
        page.goto(login_url, timeout=60000, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Navigation failed: {e}", "cookies": [], "finalUrl": ""}))
        sys.exit(0)

    # Close popups
    try:
        page.evaluate("""
            document.querySelectorAll('[class*=close], [class*=Close], [aria-label*=close], [aria-label*=Close], [class*=modal] button')
                .forEach(el => { try { el.click(); } catch {} });
        """)
        page.wait_for_timeout(1000)
    except:
        pass

    # Fill credentials
    credential = phone if (prefer_phone and phone) else email
    if not credential:
        credential = email or phone

    if not credential or not password:
        print(json.dumps({"success": False, "error": "No email/phone or password provided", "cookies": [], "finalUrl": ""}))
        sys.exit(0)

    filled_email = False
    filled_password = False

    # Try each selector for email/username
    for sel in email_sel.split(", "):
        sel = sel.strip()
        try:
            el = page.query_selector(sel)
            if el and el.is_visible():
                el.click()
                page.wait_for_timeout(300)
                el.fill(credential)
                page.wait_for_timeout(500)
                filled_email = True
                break
        except:
            continue

    # Try each selector for password
    for sel in password_sel.split(", "):
        sel = sel.strip()
        try:
            el = page.query_selector(sel)
            if el and el.is_visible():
                el.click()
                page.wait_for_timeout(300)
                el.fill(password)
                page.wait_for_timeout(500)
                filled_password = True
                break
        except:
            continue

    if not filled_email:
        print(json.dumps({"success": False, "error": "Could not find email/username input", "cookies": [], "finalUrl": page.url}))
        sys.exit(0)

    if not filled_password:
        print(json.dumps({"success": False, "error": "Could not find password input", "cookies": [], "finalUrl": page.url}))
        sys.exit(0)

    # Submit
    submitted = False
    for sel in submit_sel.split(", "):
        sel = sel.strip()
        try:
            el = page.query_selector(sel)
            if el and el.is_visible():
                el.click()
                submitted = True
                break
        except:
            continue

    if not submitted:
        # Fallback: press Enter
        page.keyboard.press("Enter")

    # Wait for navigation
    page.wait_for_timeout(post_wait)

    # Check for captcha
    captcha_indicators = ["captcha", "verify", "verificar", "robot", "recaptcha", "slider"]
    page_text = page.content().lower()
    for indicator in captcha_indicators:
        if indicator in page_text and login_url_pattern in page.url.lower():
            print(json.dumps({
                "success": False,
                "error": f"captcha_required: detected '{indicator}' on page",
                "cookies": [],
                "finalUrl": page.url,
            }))
            sys.exit(0)

    # Check success: URL should no longer contain login pattern
    final_url = page.url
    success = login_url_pattern not in final_url.lower()

    # Extract cookies
    out_cookies = []
    try:
        for c in context.cookies():
            out_cookies.append({
                "name": c.get("name", ""),
                "value": c.get("value", ""),
                "domain": c.get("domain", ""),
                "path": c.get("path", "/"),
            })
    except:
        pass

    # If we got cookies even if URL still has login, partial success
    if not success and len(out_cookies) > 5:
        success = True

    error_msg = ""
    if not success:
        error_msg = f"Login may have failed: still on {final_url}"

    print(json.dumps({
        "success": success,
        "cookies": out_cookies,
        "finalUrl": final_url,
        "error": error_msg if error_msg else None,
    }, ensure_ascii=False))
`;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

const LOGIN_TIMEOUT_MS = 180_000; // 3 min (browser startup + login flow)

export async function autoLogin(params: {
  account: AccountCredential;
  proxy?: string;
}): Promise<LoginResult> {
  const { account, proxy } = params;
  const platformConfig = PLATFORM_LOGIN_CONFIGS[account.platform];

  if (!platformConfig) {
    return {
      success: false,
      cookies: [],
      finalUrl: "",
      error: `No login config for platform: ${account.platform}`,
    };
  }

  const loginUrl = resolveLoginUrl(account.platform, account.region);
  const effectiveProxy = account.proxy ?? proxy;

  const stdinPayload = JSON.stringify({
    loginUrl,
    email: account.email ?? "",
    phone: account.phone ?? "",
    password: account.password,
    proxy: effectiveProxy,
    emailSelector: platformConfig.emailSelector,
    passwordSelector: platformConfig.passwordSelector,
    submitSelector: platformConfig.submitSelector,
    loginUrlPattern: platformConfig.loginUrlPattern,
    postLoginWaitMs: platformConfig.postLoginWaitMs,
    preferPhone: platformConfig.preferPhone ?? false,
  });

  logDebug(
    `[auto-login] Logging into ${account.platform} as ${account.email || account.phone} via ${effectiveProxy || "direct"}`,
  );

  return new Promise((resolve) => {
    const env = { ...process.env, PATH: extendedPythonPath() };
    const child = execFile(
      "python3",
      ["-c", LOGIN_SCRIPT],
      { timeout: LOGIN_TIMEOUT_MS, env, maxBuffer: 10_000_000 },
      (err, stdout, stderr) => {
        if (stderr) {
          logDebug(`[auto-login] stderr: ${stderr.slice(0, 300)}`);
        }
        if (err) {
          resolve({
            success: false,
            cookies: [],
            finalUrl: "",
            error: `Login process failed: ${err.message}`,
          });
          return;
        }
        try {
          const result = JSON.parse(stdout.trim()) as LoginResult;
          logDebug(
            `[auto-login] ${account.platform}: success=${result.success}, cookies=${result.cookies.length}, url=${result.finalUrl}`,
          );
          resolve(result);
        } catch {
          resolve({
            success: false,
            cookies: [],
            finalUrl: "",
            error: "Failed to parse login result",
          });
        }
      },
    );
    if (child.stdin) {
      child.stdin.write(stdinPayload);
      child.stdin.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Supported platforms check
// ---------------------------------------------------------------------------

export function getSupportedPlatforms(): string[] {
  return Object.keys(PLATFORM_LOGIN_CONFIGS);
}
