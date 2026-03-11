/**
 * In-memory per-session cookie jar for anti-bot evasion.
 * Simplified RFC 6265 implementation — enough for Shopee/Lazada/Amazon-level sites.
 */

export type CookieEntry = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null; // epoch ms, null = session cookie
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
};

export type CookieJar = {
  /** Store a Set-Cookie header value. */
  setCookie(rawSetCookie: string, requestUrl: string): void;
  /** Get the Cookie header string for a URL. */
  getCookieHeader(url: string): string;
  /** Import cookies (e.g. from scrapling browser context). */
  importCookies(cookies: CookieEntry[]): void;
  /** Export all cookies. */
  exportCookies(): CookieEntry[];
  /** Serialize cookies for scrapling Python script. */
  exportForScrapling(
    url: string,
  ): Array<{ name: string; value: string; domain: string; path: string }>;
  /** Clear cookies, optionally for a specific domain. */
  clear(domain?: string): void;
  /** Number of stored cookies. */
  size(): number;
};

/** Parse a single Set-Cookie header into a CookieEntry. */
export function parseSingleSetCookie(raw: string, requestUrl: string): CookieEntry | null {
  const parts = raw.split(";").map((p) => p.trim());
  if (parts.length === 0) {
    return null;
  }

  const nameValue = parts[0];
  const eqIdx = nameValue.indexOf("=");
  if (eqIdx < 1) {
    return null;
  }

  const name = nameValue.slice(0, eqIdx).trim();
  const value = nameValue.slice(eqIdx + 1).trim();

  let requestHost: string;
  try {
    requestHost = new URL(requestUrl).hostname;
  } catch {
    return null;
  }

  const entry: CookieEntry = {
    name,
    value,
    domain: requestHost,
    path: "/",
    expires: null,
    httpOnly: false,
    secure: false,
    sameSite: "lax",
  };

  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i];
    const attrLower = attr.toLowerCase();

    if (attrLower === "httponly") {
      entry.httpOnly = true;
    } else if (attrLower === "secure") {
      entry.secure = true;
    } else if (attrLower.startsWith("domain=")) {
      let domain = attr.slice(7).trim();
      if (domain.startsWith(".")) {
        domain = domain.slice(1);
      }
      entry.domain = domain.toLowerCase();
    } else if (attrLower.startsWith("path=")) {
      entry.path = attr.slice(5).trim() || "/";
    } else if (attrLower.startsWith("expires=")) {
      const dateStr = attr.slice(8).trim();
      const ms = Date.parse(dateStr);
      if (!Number.isNaN(ms)) {
        entry.expires = ms;
      }
    } else if (attrLower.startsWith("max-age=")) {
      const seconds = parseInt(attr.slice(8).trim(), 10);
      if (!Number.isNaN(seconds)) {
        // Max-Age=0 or negative means delete immediately
        entry.expires = seconds <= 0 ? 0 : Date.now() + seconds * 1000;
      }
    } else if (attrLower.startsWith("samesite=")) {
      const val = attr.slice(9).trim().toLowerCase();
      if (val === "strict" || val === "lax" || val === "none") {
        entry.sameSite = val;
      }
    }
  }

  return entry;
}

function domainMatches(cookieDomain: string, requestHost: string): boolean {
  const cd = cookieDomain.toLowerCase();
  const rh = requestHost.toLowerCase();
  if (cd === rh) {
    return true;
  }
  // Suffix match: cookie domain ".shopee.com.br" matches "mall.shopee.com.br"
  return rh.endsWith(`.${cd}`);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === "/") {
    return true;
  }
  return requestPath === cookiePath || requestPath.startsWith(`${cookiePath}/`);
}

export function createCookieJar(): CookieJar {
  const cookies: CookieEntry[] = [];

  function evictExpired(): void {
    const now = Date.now();
    for (let i = cookies.length - 1; i >= 0; i--) {
      if (cookies[i].expires !== null && cookies[i].expires! < now) {
        cookies.splice(i, 1);
      }
    }
  }

  function findIndex(name: string, domain: string, path: string): number {
    return cookies.findIndex((c) => c.name === name && c.domain === domain && c.path === path);
  }

  return {
    setCookie(rawSetCookie: string, requestUrl: string): void {
      const entry = parseSingleSetCookie(rawSetCookie, requestUrl);
      if (!entry) {
        return;
      }
      // Replace existing cookie with same name/domain/path
      const idx = findIndex(entry.name, entry.domain, entry.path);
      if (idx >= 0) {
        cookies[idx] = entry;
      } else {
        cookies.push(entry);
      }
    },

    getCookieHeader(url: string): string {
      evictExpired();
      let host: string;
      let pathname: string;
      try {
        const u = new URL(url);
        host = u.hostname;
        pathname = u.pathname;
      } catch {
        return "";
      }

      const matching = cookies.filter(
        (c) => domainMatches(c.domain, host) && pathMatches(c.path, pathname),
      );

      if (matching.length === 0) {
        return "";
      }

      return matching.map((c) => `${c.name}=${c.value}`).join("; ");
    },

    importCookies(newCookies: CookieEntry[]): void {
      for (const entry of newCookies) {
        const idx = findIndex(entry.name, entry.domain, entry.path);
        if (idx >= 0) {
          cookies[idx] = entry;
        } else {
          cookies.push(entry);
        }
      }
    },

    exportCookies(): CookieEntry[] {
      evictExpired();
      return [...cookies];
    },

    exportForScrapling(
      url: string,
    ): Array<{ name: string; value: string; domain: string; path: string }> {
      evictExpired();
      let host: string;
      let pathname: string;
      try {
        const u = new URL(url);
        host = u.hostname;
        pathname = u.pathname;
      } catch {
        return [];
      }
      return cookies
        .filter((c) => domainMatches(c.domain, host) && pathMatches(c.path, pathname))
        .map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));
    },

    clear(domain?: string): void {
      if (!domain) {
        cookies.length = 0;
        return;
      }
      for (let i = cookies.length - 1; i >= 0; i--) {
        if (cookies[i].domain === domain) {
          cookies.splice(i, 1);
        }
      }
    },

    size(): number {
      evictExpired();
      return cookies.length;
    },
  };
}
