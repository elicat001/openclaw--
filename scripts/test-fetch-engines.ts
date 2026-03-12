#!/usr/bin/env bun
/**
 * End-to-end test script for web-fetch engines.
 * Tests each engine layer individually against real sites to verify they work.
 *
 * Usage: pnpm tsx scripts/test-fetch-engines.ts
 */

import { isScraplingInstalled } from "../src/agents/tools/scrapling-tool.js";
import {
  fetchWithCamoufox,
  isCamoufoxInstalled,
} from "../src/agents/tools/web-fetch-camoufox-engine.js";
import { createPersistentCookieStore } from "../src/agents/tools/web-fetch-cookie-store.js";
import { callScraplingInternal } from "../src/agents/tools/web-fetch-escalation.js";
import { createBrowserFingerprint } from "../src/agents/tools/web-fetch-fingerprint-db.js";
import { createProxyPool } from "../src/agents/tools/web-fetch-proxy-pool.js";
import {
  fetchWithTlsImpersonation,
  pickImpersonateProfile,
  isCurlCffiInstalled,
} from "../src/agents/tools/web-fetch-tls-engine.js";

const TEST_URLS = {
  simple: "https://www.example.com",
  shopee: "https://shopee.com.br",
  amazon: "https://www.amazon.com",
};

function logResult(
  engine: string,
  url: string,
  result: { status?: number; bodyLen?: number; error?: string; cookies?: number },
) {
  if (result.error) {
    console.log(`  ❌ ${engine} → ${new URL(url).hostname}: ERROR: ${result.error}`);
  } else {
    console.log(
      `  ✅ ${engine} → ${new URL(url).hostname}: status=${result.status}, body=${result.bodyLen} chars, cookies=${result.cookies ?? 0}`,
    );
  }
}

async function testAvailability() {
  console.log("\n═══ Engine Availability ═══\n");

  const [scrapling, curlCffi, camoufox] = await Promise.all([
    isScraplingInstalled(),
    isCurlCffiInstalled(),
    isCamoufoxInstalled(),
  ]);

  console.log(`  scrapling:  ${scrapling ? "✅" : "❌"}`);
  console.log(`  curl_cffi:  ${curlCffi ? "✅" : "❌"}`);
  console.log(
    `  camoufox:   ${camoufox ? "✅" : "❌ (browser binary not downloaded — run: python3 -m camoufox fetch)"}`,
  );

  return { scrapling, curlCffi, camoufox };
}

async function testFingerprint() {
  console.log("\n═══ Fingerprint DB ═══\n");
  const fp = createBrowserFingerprint();
  console.log(
    `  ${fp.browserFamily} v${fp.browserVersion} | ${fp.platform} | ${fp.viewport.width}x${fp.viewport.height}`,
  );
  console.log(`  UA: ${fp.userAgent.substring(0, 80)}...`);
}

async function testCookieStore() {
  console.log("\n═══ Cookie Store (SQLite) ═══\n");
  const store = createPersistentCookieStore(":memory:");
  store.setCookie("test=value123; Domain=example.com; Path=/", "https://example.com/");
  const header = store.getCookieHeader("https://example.com/page");
  console.log(`  ✅ set/get cookie: ${header}`);
  store.close();
}

async function testProxyPool() {
  console.log("\n═══ Proxy Pool ═══\n");
  const pool = createProxyPool({ strategy: "domain-affinity" });
  console.log(
    `  ${pool.size === 0 ? "⚠️  No proxies (set HTTP_PROXY/HTTPS_PROXY)" : `✅ ${pool.size} proxies loaded`}`,
  );
}

async function testTlsEngine() {
  console.log("\n═══ TLS Impersonation (curl_cffi) ═══\n");

  const fp = createBrowserFingerprint({ preferBrowser: "chrome" });
  const profile = pickImpersonateProfile(fp);
  console.log(`  Profile: ${profile} (from ${fp.browserFamily} v${fp.browserVersion})\n`);

  for (const [_label, url] of Object.entries(TEST_URLS)) {
    try {
      const start = Date.now();
      const result = await fetchWithTlsImpersonation({
        url,
        impersonate: profile,
        timeout: 20,
      });
      const took = Date.now() - start;

      if (result) {
        logResult(`tls(${profile})`, url, {
          status: result.status,
          bodyLen: result.body.length,
          cookies: result.cookies?.length,
        });
        console.log(`     took ${took}ms`);
        // Check if body looks like real content or a block page
        if (result.body.length < 500 && result.status >= 400) {
          console.log(`     ⚠️  Short body + error status — likely BLOCKED`);
        }
      } else {
        logResult(`tls(${profile})`, url, { error: `returned null (${took}ms)` });
      }
    } catch (e: unknown) {
      logResult(`tls(${profile})`, url, { error: String(e) });
    }
  }
}

async function testScrapling() {
  console.log("\n═══ Scrapling Engine ═══\n");

  // Fast mode
  for (const [label, url] of [
    ["example", TEST_URLS.simple],
    ["shopee", TEST_URLS.shopee],
  ] as const) {
    const mode = label === "shopee" ? "stealth" : "fast";
    try {
      const start = Date.now();
      const result = await callScraplingInternal({
        url,
        mode,
        maxChars: 20000,
        solveCloudflare: mode === "stealth",
      });
      const took = Date.now() - start;

      if (result) {
        logResult(`scrapling-${mode}`, url, {
          status: result.status,
          bodyLen: result.text.length,
          cookies: result.cookies?.length,
        });
        console.log(`     took ${took}ms`);
        // Show a snippet of what we got
        const snippet = result.text.replace(/\s+/g, " ").trim().substring(0, 150);
        console.log(`     snippet: "${snippet}..."`);
      } else {
        logResult(`scrapling-${mode}`, url, { error: `returned null (${took}ms)` });
      }
    } catch (e: unknown) {
      logResult(`scrapling-${mode}`, url, { error: String(e) });
    }
  }
}

async function testCamoufox() {
  console.log("\n═══ Camoufox Engine ═══\n");

  for (const [label, url] of [
    ["example", TEST_URLS.simple],
    ["shopee", TEST_URLS.shopee],
  ] as const) {
    try {
      console.log(`  Testing ${label}...`);
      const start = Date.now();
      const result = await fetchWithCamoufox({
        url,
        humanize: true,
        timeout: 60,
      });
      const took = Date.now() - start;

      if (result) {
        logResult("camoufox", url, {
          status: result.status,
          bodyLen: result.text.length,
          cookies: result.cookies?.length,
        });
        console.log(`     took ${took}ms`);
      } else {
        logResult("camoufox", url, { error: `returned null (${took}ms)` });
      }
    } catch (e: unknown) {
      logResult("camoufox", url, { error: String(e) });
    }
  }
}

async function main() {
  console.log("🔍 OpenClaw Web-Fetch Engine E2E Test\n");

  const avail = await testAvailability();
  await testFingerprint();
  await testCookieStore();
  await testProxyPool();

  if (avail.curlCffi) {
    await testTlsEngine();
  } else {
    console.log("\n⏭️  Skipping TLS engine (curl_cffi not installed)");
  }

  if (avail.scrapling) {
    await testScrapling();
  } else {
    console.log("\n⏭️  Skipping Scrapling (not installed)");
  }

  if (avail.camoufox) {
    await testCamoufox();
  } else {
    console.log("\n⏭️  Skipping Camoufox (browser binary not downloaded)");
  }

  console.log("\n═══ Done ═══\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
