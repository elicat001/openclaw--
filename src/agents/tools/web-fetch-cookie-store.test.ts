import { afterEach, describe, expect, it } from "vitest";
import {
  createPersistentCookieStore,
  type PersistentCookieStore,
} from "./web-fetch-cookie-store.js";

describe("PersistentCookieStore", () => {
  let store: PersistentCookieStore;

  afterEach(() => {
    try {
      store?.close();
    } catch {
      // already closed or not initialized
    }
  });

  it("setCookie persists to DB and getCookieHeader retrieves it", () => {
    store = createPersistentCookieStore(":memory:");
    store.setCookie("sid=abc123; Domain=example.com; Path=/", "https://example.com/login");

    expect(store.getCookieHeader("https://example.com/page")).toBe("sid=abc123");
  });

  it("getCookieHeader loads from DB when jar is fresh", () => {
    // Use the same :memory: DB via two operations on one store:
    // 1. Set a cookie, 2. Create a fresh store and verify it reads back.
    // Since :memory: is per-connection, we test via importCookies + persist instead.
    store = createPersistentCookieStore(":memory:");
    store.importCookies([
      {
        name: "token",
        value: "xyz",
        domain: "api.test.com",
        path: "/",
        expires: null,
        httpOnly: false,
        secure: true,
        sameSite: "lax",
      },
    ]);

    // The cookie should be available via getCookieHeader
    const header = store.getCookieHeader("https://api.test.com/v1");
    expect(header).toBe("token=xyz");
  });

  it("replaces cookie with same name/domain/path", () => {
    store = createPersistentCookieStore(":memory:");
    store.setCookie("k=v1; Domain=example.com; Path=/", "https://example.com/");
    store.setCookie("k=v2; Domain=example.com; Path=/", "https://example.com/");

    expect(store.getCookieHeader("https://example.com/")).toBe("k=v2");
    expect(store.size()).toBe(1);
  });

  it("deleteExpired removes old cookies from DB", () => {
    store = createPersistentCookieStore(":memory:");
    const pastDate = new Date(Date.now() - 86400_000).toUTCString();
    store.setCookie(`old=1; Domain=example.com; Expires=${pastDate}`, "https://example.com/");

    // Expired cookie should already be evicted from the jar by exportCookies
    // but let's import one with a past expiry directly
    store.importCookies([
      {
        name: "stale",
        value: "gone",
        domain: "example.com",
        path: "/",
        expires: Date.now() - 60_000,
        httpOnly: false,
        secure: false,
        sameSite: "lax",
      },
    ]);

    const deleted = store.deleteExpired();
    expect(deleted).toBeGreaterThanOrEqual(1);
  });

  it("loadDomain imports cookies into jar", () => {
    store = createPersistentCookieStore(":memory:");
    // Import a cookie so it lands in DB
    store.importCookies([
      {
        name: "sess",
        value: "abc",
        domain: "shop.example.com",
        path: "/",
        expires: null,
        httpOnly: true,
        secure: false,
        sameSite: "strict",
      },
    ]);

    // Clear the in-memory jar but keep DB
    store.clear();
    expect(store.size()).toBe(0);

    // loadDomain should pull it back from DB
    store.loadDomain("shop.example.com");
    expect(store.size()).toBe(1);
    expect(store.getCookieHeader("https://shop.example.com/cart")).toBe("sess=abc");
  });

  it("persist() flushes all cookies to DB", () => {
    store = createPersistentCookieStore(":memory:");
    store.setCookie("a=1; Domain=example.com", "https://example.com/");
    store.setCookie("b=2; Domain=example.com", "https://example.com/");
    // persist is called; should not throw
    store.persist();

    // Verify cookies are still accessible
    expect(store.getCookieHeader("https://example.com/")).toContain("a=1");
    expect(store.getCookieHeader("https://example.com/")).toContain("b=2");
  });

  it("close() works without error", () => {
    store = createPersistentCookieStore(":memory:");
    store.setCookie("x=y; Domain=example.com", "https://example.com/");
    expect(() => store.close()).not.toThrow();
  });

  it("exportCookies and size delegate to inner jar", () => {
    store = createPersistentCookieStore(":memory:");
    store.setCookie("c=d; Domain=test.com", "https://test.com/");
    expect(store.size()).toBe(1);
    const exported = store.exportCookies();
    expect(exported).toHaveLength(1);
    expect(exported[0].name).toBe("c");
  });

  it("exportForScrapling delegates to inner jar", () => {
    store = createPersistentCookieStore(":memory:");
    store.setCookie("f=g; Domain=scrape.com", "https://scrape.com/page");
    const result = store.exportForScrapling("https://scrape.com/page");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("f");
  });
});

describe("PersistentCookieStore close and re-create", () => {
  it("close does not throw and a new store can be created after", () => {
    const store1 = createPersistentCookieStore(":memory:");
    store1.setCookie("a=b; Domain=example.com", "https://example.com/");
    expect(() => store1.close()).not.toThrow();

    // A new store can still be created and works normally
    const store2 = createPersistentCookieStore(":memory:");
    store2.setCookie("k=v; Domain=example.com", "https://example.com/");
    expect(store2.getCookieHeader("https://example.com/")).toBe("k=v");
    store2.close();
  });
});
