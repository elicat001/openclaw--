import { describe, expect, test } from "vitest";
import { createCookieJar, parseSingleSetCookie } from "./web-fetch-cookie-jar.js";

describe("parseSingleSetCookie", () => {
  test("parses basic cookie", () => {
    const cookie = parseSingleSetCookie("session=abc123", "https://shopee.com.br/search");
    expect(cookie).toMatchObject({
      name: "session",
      value: "abc123",
      domain: "shopee.com.br",
      path: "/",
    });
  });

  test("parses cookie with attributes", () => {
    const raw =
      "sid=xyz; Domain=.shopee.com.br; Path=/api; Secure; HttpOnly; SameSite=Strict; Max-Age=3600";
    const cookie = parseSingleSetCookie(raw, "https://shopee.com.br/");
    expect(cookie).toMatchObject({
      name: "sid",
      value: "xyz",
      domain: "shopee.com.br",
      path: "/api",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
    expect(cookie!.expires).toBeGreaterThan(Date.now());
  });

  test("returns null for invalid cookie", () => {
    expect(parseSingleSetCookie("", "https://example.com")).toBeNull();
    expect(parseSingleSetCookie("=value", "https://example.com")).toBeNull();
  });
});

describe("CookieJar", () => {
  test("setCookie and getCookieHeader", () => {
    const jar = createCookieJar();
    jar.setCookie("session=abc123", "https://shopee.com.br/search");
    jar.setCookie("lang=pt", "https://shopee.com.br/");

    const header = jar.getCookieHeader("https://shopee.com.br/search?q=test");
    expect(header).toContain("session=abc123");
    expect(header).toContain("lang=pt");
  });

  test("domain suffix matching", () => {
    const jar = createCookieJar();
    jar.setCookie("sid=123; Domain=.shopee.com.br", "https://mall.shopee.com.br/");

    expect(jar.getCookieHeader("https://shopee.com.br/")).toContain("sid=123");
    expect(jar.getCookieHeader("https://mall.shopee.com.br/")).toContain("sid=123");
    expect(jar.getCookieHeader("https://other.com/")).toBe("");
  });

  test("path matching", () => {
    const jar = createCookieJar();
    jar.setCookie("api_token=xyz; Path=/api", "https://shopee.com.br/api/v1");

    expect(jar.getCookieHeader("https://shopee.com.br/api/products")).toContain("api_token=xyz");
    expect(jar.getCookieHeader("https://shopee.com.br/search")).toBe("");
  });

  test("cookie replacement", () => {
    const jar = createCookieJar();
    jar.setCookie("session=old", "https://shopee.com.br/");
    jar.setCookie("session=new", "https://shopee.com.br/");

    const header = jar.getCookieHeader("https://shopee.com.br/");
    expect(header).toBe("session=new");
    expect(jar.size()).toBe(1);
  });

  test("expired cookies are evicted", () => {
    const jar = createCookieJar();
    jar.setCookie("old=cookie; Max-Age=0", "https://shopee.com.br/");
    expect(jar.getCookieHeader("https://shopee.com.br/")).toBe("");
  });

  test("importCookies and exportCookies", () => {
    const jar = createCookieJar();
    jar.importCookies([
      {
        name: "imported",
        value: "val",
        domain: "shopee.com.br",
        path: "/",
        expires: null,
        httpOnly: false,
        secure: false,
        sameSite: "lax",
      },
    ]);

    expect(jar.getCookieHeader("https://shopee.com.br/")).toBe("imported=val");
    expect(jar.exportCookies()).toHaveLength(1);
  });

  test("exportForScrapling returns matching cookies", () => {
    const jar = createCookieJar();
    jar.setCookie("a=1", "https://shopee.com.br/");
    jar.setCookie("b=2", "https://other.com/");

    const exported = jar.exportForScrapling("https://shopee.com.br/search");
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ name: "a", value: "1" });
  });

  test("clear removes cookies", () => {
    const jar = createCookieJar();
    jar.setCookie("a=1", "https://shopee.com.br/");
    jar.setCookie("b=2", "https://other.com/");

    jar.clear("shopee.com.br");
    expect(jar.size()).toBe(1);

    jar.clear();
    expect(jar.size()).toBe(0);
  });
});
