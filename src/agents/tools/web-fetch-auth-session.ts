/**
 * Authenticated session manager -- binds account + cookies + proxy together.
 * Checks if existing cookies are valid, otherwise triggers auto-login.
 */

import { logDebug } from "../../logger.js";
import type { AccountCredential, AccountPool } from "./web-fetch-account-pool.js";
import { autoLogin } from "./web-fetch-auto-login.js";
import type { CookieEntry } from "./web-fetch-cookie-jar.js";
import type { PersistentCookieStore } from "./web-fetch-cookie-store.js";
import type { ProxyPool } from "./web-fetch-proxy-pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthSession = {
  account: AccountCredential;
  cookies: CookieEntry[];
  proxy: string | null;
  loggedInAt: number;
  /** Check if this session likely still has valid cookies. */
  isValid(): boolean;
  /** Re-login to refresh cookies. */
  refresh(): Promise<boolean>;
};

export type AcquireAuthSessionParams = {
  platform: string;
  region?: string;
  accountPool: AccountPool;
  cookieStore: PersistentCookieStore;
  proxyPool?: ProxyPool;
};

// ---------------------------------------------------------------------------
// Platform → cookie domain mapping
// ---------------------------------------------------------------------------

const PLATFORM_COOKIE_DOMAINS: Record<string, string[]> = {
  temu: ["temu.com"],
  shein: ["shein.com"],
  shopee: [
    "shopee.com.br",
    "shopee.ph",
    "shopee.sg",
    "shopee.com.my",
    "shopee.co.th",
    "shopee.vn",
    "shopee.co.id",
    "shopee.tw",
  ],
  lazada: ["lazada.com"],
  amazon: ["amazon.com.br", "amazon.com"],
};

// Cookie validity heuristic: if we have >3 cookies for the domain, consider valid
const MIN_COOKIES_FOR_VALIDITY = 3;
// Sessions older than 12 hours should be refreshed
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function getCookieDomains(platform: string, region?: string): string[] {
  const domains = PLATFORM_COOKIE_DOMAINS[platform] ?? [];
  if (region && platform === "shopee") {
    // Filter to region-specific domain
    const regionMap: Record<string, string> = {
      br: "shopee.com.br",
      ph: "shopee.ph",
      sg: "shopee.sg",
      my: "shopee.com.my",
      th: "shopee.co.th",
      vn: "shopee.vn",
      id: "shopee.co.id",
      tw: "shopee.tw",
    };
    if (regionMap[region]) {
      return [regionMap[region]];
    }
  }
  if (region && platform === "shein") {
    return [`${region}.shein.com`];
  }
  return domains;
}

function resolveProxy(
  account: AccountCredential,
  proxyPool?: ProxyPool,
  platform?: string,
): string | null {
  // Priority 1: Account-specific proxy
  if (account.proxy) {
    return account.proxy;
  }
  // Priority 2: Proxy pool (residential preferred)
  if (proxyPool) {
    const domains = PLATFORM_COOKIE_DOMAINS[platform ?? account.platform] ?? [];
    const proxy = proxyPool.getProxy(domains[0] ?? account.platform);
    if (proxy) {
      return proxy.url;
    }
  }
  return null;
}

export async function acquireAuthSession(
  params: AcquireAuthSessionParams,
): Promise<AuthSession | null> {
  const { platform, region, accountPool, cookieStore, proxyPool } = params;

  // Step 1: Get an available account
  const account = accountPool.getAccount(platform, region);
  if (!account) {
    logDebug(`[auth-session] No available account for ${platform}/${region ?? "any"}`);
    return null;
  }

  const proxy = resolveProxy(account, proxyPool, platform);
  const cookieDomains = getCookieDomains(platform, region);

  // Step 2: Check if we have valid cookies in the store
  let existingCookies: CookieEntry[] = [];
  for (const domain of cookieDomains) {
    cookieStore.loadDomain(domain);
  }
  existingCookies = cookieStore
    .exportCookies()
    .filter((c) => cookieDomains.some((d) => c.domain.includes(d)));

  const hasValidCookies =
    existingCookies.length >= MIN_COOKIES_FOR_VALIDITY &&
    account.cookiesValid &&
    account.lastLoginAt > 0 &&
    Date.now() - account.lastLoginAt < SESSION_MAX_AGE_MS;

  if (hasValidCookies) {
    logDebug(`[auth-session] Reusing ${existingCookies.length} existing cookies for ${account.id}`);
    return createAuthSession(
      account,
      existingCookies,
      proxy,
      account.lastLoginAt,
      accountPool,
      cookieStore,
      proxyPool,
    );
  }

  // Step 3: Need to login
  logDebug(`[auth-session] Logging in account ${account.id} (${account.email || account.phone})`);
  const loginResult = await autoLogin({ account, proxy: proxy ?? undefined });

  if (loginResult.success && loginResult.cookies.length > 0) {
    accountPool.markLoginSuccess(account.id);

    // Save cookies to persistent store
    cookieStore.importCookies(loginResult.cookies);
    cookieStore.persist();

    logDebug(`[auth-session] Login successful: ${loginResult.cookies.length} cookies saved`);
    return createAuthSession(
      account,
      loginResult.cookies,
      proxy,
      Date.now(),
      accountPool,
      cookieStore,
      proxyPool,
    );
  }

  // Login failed
  accountPool.markLoginFailed(account.id);
  logDebug(`[auth-session] Login failed for ${account.id}: ${loginResult.error}`);

  // Try next account if this one failed
  if (accountPool.getAll(platform).some((a) => a.id !== account.id && a.status !== "banned")) {
    logDebug(`[auth-session] Trying next account...`);
    return acquireAuthSession(params);
  }

  return null;
}

function createAuthSession(
  account: AccountCredential,
  cookies: CookieEntry[],
  proxy: string | null,
  loggedInAt: number,
  accountPool: AccountPool,
  cookieStore: PersistentCookieStore,
  proxyPool?: ProxyPool,
): AuthSession {
  return {
    account,
    cookies,
    proxy,
    loggedInAt,

    isValid(): boolean {
      return (
        account.cookiesValid &&
        Date.now() - loggedInAt < SESSION_MAX_AGE_MS &&
        cookies.length >= MIN_COOKIES_FOR_VALIDITY
      );
    },

    async refresh(): Promise<boolean> {
      const newProxy = resolveProxy(account, proxyPool, account.platform);
      const result = await autoLogin({ account, proxy: newProxy ?? undefined });

      if (result.success && result.cookies.length > 0) {
        accountPool.markLoginSuccess(account.id);
        cookieStore.importCookies(result.cookies);
        cookieStore.persist();

        // Update session state
        this.cookies = result.cookies;
        this.loggedInAt = Date.now();
        this.proxy = newProxy;
        return true;
      }

      accountPool.markLoginFailed(account.id);
      return false;
    },
  };
}
