/**
 * SQLite-backed persistent cookie storage, wrapping the in-memory CookieJar.
 * Falls back to plain in-memory jar when node:sqlite is unavailable.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { createCookieJar, type CookieEntry, type CookieJar } from "./web-fetch-cookie-jar.js";

export type PersistentCookieStore = CookieJar & {
  /** Flush all in-memory cookies to SQLite. */
  persist(): void;
  /** Load cookies for a domain from DB into the in-memory jar. */
  loadDomain(domain: string): void;
  /** Delete expired cookies from DB. Returns count deleted. */
  deleteExpired(): number;
  /** Close DB connection. */
  close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cookies (
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  expires INTEGER,
  httpOnly INTEGER NOT NULL DEFAULT 0,
  secure INTEGER NOT NULL DEFAULT 0,
  sameSite TEXT NOT NULL DEFAULT 'lax',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (name, domain, path)
);
CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain);
CREATE INDEX IF NOT EXISTS idx_cookies_expires ON cookies(expires);
`;

function upsertCookie(db: DatabaseSync, cookie: CookieEntry): void {
  const stmt = db.prepare(`
    INSERT INTO cookies (name, value, domain, path, expires, httpOnly, secure, sameSite, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name, domain, path) DO UPDATE SET
      value = excluded.value,
      expires = excluded.expires,
      httpOnly = excluded.httpOnly,
      secure = excluded.secure,
      sameSite = excluded.sameSite,
      updatedAt = excluded.updatedAt
  `);
  const now = Date.now();
  stmt.run(
    cookie.name,
    cookie.value,
    cookie.domain,
    cookie.path,
    cookie.expires,
    cookie.httpOnly ? 1 : 0,
    cookie.secure ? 1 : 0,
    cookie.sameSite,
    now,
    now,
  );
}

type CookieRow = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  httpOnly: number;
  secure: number;
  sameSite: string;
};

function rowToEntry(row: CookieRow): CookieEntry {
  return {
    name: row.name,
    value: row.value,
    domain: row.domain,
    path: row.path,
    expires: row.expires,
    httpOnly: row.httpOnly === 1,
    secure: row.secure === 1,
    sameSite: row.sameSite as CookieEntry["sameSite"],
  };
}

export function createPersistentCookieStore(dbPath?: string): PersistentCookieStore {
  try {
    const sqlite = requireNodeSqlite();
    const resolvedPath = dbPath ?? join(homedir(), ".openclaw", "cookies.db");

    if (resolvedPath !== ":memory:") {
      mkdirSync(dirname(resolvedPath), { recursive: true });
    }

    const db = new sqlite.DatabaseSync(resolvedPath);
    db.exec(SCHEMA);

    const jar = createCookieJar();
    const loadedDomains = new Set<string>();

    function loadDomain(domain: string): void {
      if (loadedDomains.has(domain)) {
        return;
      }
      loadedDomains.add(domain);

      const rows = db
        .prepare("SELECT * FROM cookies WHERE domain = ? OR ? LIKE '%.' || domain")
        .all(domain, domain) as CookieRow[];

      if (rows.length > 0) {
        jar.importCookies(rows.map(rowToEntry));
      }
    }

    function persist(): void {
      for (const cookie of jar.exportCookies()) {
        upsertCookie(db, cookie);
      }
    }

    function deleteExpired(): number {
      const now = Date.now();
      const result = db
        .prepare("DELETE FROM cookies WHERE expires IS NOT NULL AND expires < ?")
        .run(now);
      return Number(result.changes);
    }

    return {
      setCookie(rawSetCookie: string, requestUrl: string): void {
        const before = jar.size();
        jar.setCookie(rawSetCookie, requestUrl);
        // Upsert all cookies -- simpler than tracking which one changed
        const all = jar.exportCookies();
        if (all.length > 0) {
          // If size grew, the new cookie is at the end; otherwise scan all (replacement)
          if (all.length > before) {
            upsertCookie(db, all[all.length - 1]);
          } else {
            for (const c of all) {
              upsertCookie(db, c);
            }
          }
        }
      },

      getCookieHeader(url: string): string {
        try {
          const host = new URL(url).hostname;
          loadDomain(host);
        } catch {
          // invalid URL, delegate to jar which will return ""
        }
        return jar.getCookieHeader(url);
      },

      importCookies(cookies: CookieEntry[]): void {
        jar.importCookies(cookies);
        for (const cookie of cookies) {
          upsertCookie(db, cookie);
        }
      },

      exportCookies(): CookieEntry[] {
        return jar.exportCookies();
      },

      exportForScrapling(
        url: string,
      ): Array<{ name: string; value: string; domain: string; path: string }> {
        return jar.exportForScrapling(url);
      },

      clear(domain?: string): void {
        jar.clear(domain);
      },

      size(): number {
        return jar.size();
      },

      persist,
      loadDomain,
      deleteExpired,

      close(): void {
        persist();
        db.close();
      },
    };
  } catch {
    // Fallback to in-memory only when SQLite is unavailable
    const jar = createCookieJar();
    return Object.assign(jar, {
      persist() {},
      loadDomain(_domain: string) {},
      deleteExpired() {
        return 0;
      },
      close() {},
    });
  }
}
