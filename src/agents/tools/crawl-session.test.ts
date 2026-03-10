import { afterEach, describe, expect, test } from "vitest";
import {
  acquireCrawlSession,
  forceReleaseCrawlSession,
  getActiveCrawlSession,
  hasActiveCrawlSession,
} from "./crawl-session.js";

afterEach(() => {
  forceReleaseCrawlSession();
});

describe("acquireCrawlSession", () => {
  test("creates a session with correct properties", () => {
    const session = acquireCrawlSession({
      keyword: "livro infantil",
      sort: "sales",
      profile: "conservative",
      site: "shopee.com.br",
    });
    expect(session).not.toBeNull();
    expect(session!.keyword).toBe("livro infantil");
    expect(session!.sort).toBe("sales");
    expect(session!.site).toBe("shopee.com.br");
    expect(session!.profile.name).toBe("conservative");
    expect(session!.active).toBe(true);
  });

  test("defaults to balanced profile", () => {
    const session = acquireCrawlSession({ keyword: "test" });
    expect(session!.profile.name).toBe("balanced");
  });

  test("defaults sort to relevance", () => {
    const session = acquireCrawlSession({ keyword: "test" });
    expect(session!.sort).toBe("relevance");
  });

  test("规则 5: rejects concurrent sessions", () => {
    const first = acquireCrawlSession({ keyword: "A" });
    expect(first).not.toBeNull();

    const second = acquireCrawlSession({ keyword: "B" });
    expect(second).toBeNull();
  });

  test("allows new session after release", () => {
    const first = acquireCrawlSession({ keyword: "A" });
    first!.release();

    const second = acquireCrawlSession({ keyword: "B" });
    expect(second).not.toBeNull();
    expect(second!.keyword).toBe("B");
  });
});

describe("validateKeyword (规则 1, 7)", () => {
  test("accepts matching keyword", () => {
    const session = acquireCrawlSession({
      keyword: "livro infantil",
      profile: "conservative",
    });
    expect(session!.validateKeyword("livro infantil")).toBe(true);
  });

  test("case-insensitive match", () => {
    const session = acquireCrawlSession({
      keyword: "Livro Infantil",
      profile: "conservative",
    });
    expect(session!.validateKeyword("livro infantil")).toBe(true);
  });

  test("rejects different keyword in conservative mode", () => {
    const session = acquireCrawlSession({
      keyword: "livro infantil",
      profile: "conservative",
    });
    expect(session!.validateKeyword("brinquedo")).toBe(false);
  });

  test("allows different keyword in aggressive mode", () => {
    const session = acquireCrawlSession({
      keyword: "livro infantil",
      profile: "aggressive",
    });
    expect(session!.validateKeyword("brinquedo")).toBe(true);
  });
});

describe("validateSort (规则 7)", () => {
  test("accepts matching sort", () => {
    const session = acquireCrawlSession({
      keyword: "test",
      sort: "sales",
      profile: "balanced",
    });
    expect(session!.validateSort("sales")).toBe(true);
  });

  test("rejects different sort in balanced mode", () => {
    const session = acquireCrawlSession({
      keyword: "test",
      sort: "sales",
      profile: "balanced",
    });
    expect(session!.validateSort("price")).toBe(false);
  });
});

describe("hasActiveCrawlSession / getActiveCrawlSession", () => {
  test("reports no session initially", () => {
    expect(hasActiveCrawlSession()).toBe(false);
    expect(getActiveCrawlSession()).toBeNull();
  });

  test("reports active session", () => {
    acquireCrawlSession({ keyword: "test" });
    expect(hasActiveCrawlSession()).toBe(true);
    expect(getActiveCrawlSession()).not.toBeNull();
  });

  test("reports no session after release", () => {
    const session = acquireCrawlSession({ keyword: "test" });
    session!.release();
    expect(hasActiveCrawlSession()).toBe(false);
  });
});

describe("session summary", () => {
  test("returns correct summary", () => {
    const session = acquireCrawlSession({
      keyword: "livro",
      sort: "sales",
      profile: "balanced",
      site: "shopee.com.br",
    });
    const summary = session!.summary();
    expect(summary.keyword).toBe("livro");
    expect(summary.sort).toBe("sales");
    expect(summary.profile).toBe("balanced");
    expect(summary.site).toBe("shopee.com.br");
    expect(summary.itemsFetched).toBe(0);
    expect(summary.batchNumber).toBe(1);
    expect(summary.aborted).toBe(false);
  });
});

describe("forceReleaseCrawlSession", () => {
  test("releases without session", () => {
    // Should not throw
    forceReleaseCrawlSession();
  });

  test("force-releases active session", () => {
    acquireCrawlSession({ keyword: "test" });
    expect(hasActiveCrawlSession()).toBe(true);
    forceReleaseCrawlSession();
    expect(hasActiveCrawlSession()).toBe(false);
  });
});
