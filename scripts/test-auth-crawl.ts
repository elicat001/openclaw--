#!/usr/bin/env bun
/**
 * End-to-end test for authenticated crawling.
 *
 * Usage:
 *   pnpm tsx scripts/test-auth-crawl.ts                           # Show available accounts
 *   pnpm tsx scripts/test-auth-crawl.ts --platform temu --login-only  # Test login only
 *   pnpm tsx scripts/test-auth-crawl.ts --platform temu --search "furadeira eletrica"
 *   pnpm tsx scripts/test-auth-crawl.ts --all                     # Test all platforms
 */

import { loadAccountPool } from "../src/agents/tools/web-fetch-account-pool.js";
import { acquireAuthSession } from "../src/agents/tools/web-fetch-auth-session.js";
import { autoLogin, getSupportedPlatforms } from "../src/agents/tools/web-fetch-auto-login.js";
import { fetchWithCamoufox } from "../src/agents/tools/web-fetch-camoufox-engine.js";
import { createPersistentCookieStore } from "../src/agents/tools/web-fetch-cookie-store.js";
import { createProxyPool } from "../src/agents/tools/web-fetch-proxy-pool.js";

const args = process.argv.slice(2);
const platformArg = args.find((_, i) => args[i - 1] === "--platform") ?? "";
const searchArg = args.find((_, i) => args[i - 1] === "--search") ?? "";
const loginOnly = args.includes("--login-only");
const allPlatforms = args.includes("--all");

async function showStatus() {
  const pool = loadAccountPool();
  console.log("\n═══ Account Pool Status ═══\n");
  console.log(`Total accounts: ${pool.size}`);
  console.log(`Supported platforms: ${getSupportedPlatforms().join(", ")}\n`);

  if (pool.size === 0) {
    console.log("⚠️  No accounts configured.");
    console.log("   Create ~/.openclaw/accounts.json with your account credentials.");
    console.log("   See the schema in web-fetch-account-pool.ts\n");
    return;
  }

  const all = pool.getAll();
  console.log("| ID | Platform | Email/Phone | Region | Status | Proxy |");
  console.log("|----|----------|-------------|--------|--------|-------|");
  for (const a of all) {
    const credential = a.email || a.phone || "-";
    const proxy = a.proxy ? "✅" : "-";
    console.log(
      `| ${a.id} | ${a.platform} | ${credential} | ${a.region} | ${a.status} | ${proxy} |`,
    );
  }
  console.log();
}

async function testLogin(platform: string) {
  console.log(`\n═══ Login Test: ${platform} ═══\n`);

  const pool = loadAccountPool();
  const account = pool.getAccount(platform);

  if (!account) {
    console.log(`❌ No available account for platform: ${platform}`);
    return null;
  }

  console.log(`Account: ${account.id} (${account.email || account.phone})`);
  console.log(`Proxy: ${account.proxy || "none (direct)"}`);
  console.log(`Logging in...\n`);

  const start = Date.now();
  const result = await autoLogin({
    account,
    proxy: account.proxy,
  });
  const took = Date.now() - start;

  if (result.success) {
    console.log(`✅ Login successful! (${took}ms)`);
    console.log(`   Cookies: ${result.cookies.length}`);
    console.log(`   Final URL: ${result.finalUrl}`);

    // Show cookie names
    const cookieNames = result.cookies.map((c) => c.name).slice(0, 10);
    console.log(
      `   Cookie names: ${cookieNames.join(", ")}${result.cookies.length > 10 ? "..." : ""}`,
    );

    pool.markLoginSuccess(account.id);
    return result;
  } else {
    console.log(`❌ Login failed (${took}ms)`);
    console.log(`   Error: ${result.error}`);
    console.log(`   Final URL: ${result.finalUrl}`);

    pool.markLoginFailed(account.id);
    return null;
  }
}

async function testSearch(platform: string, query: string) {
  console.log(`\n═══ Search Test: ${platform} - "${query}" ═══\n`);

  const accountPool = loadAccountPool();
  const cookieStore = createPersistentCookieStore();
  const proxyPool = createProxyPool({ strategy: "domain-affinity" });

  const session = await acquireAuthSession({
    platform,
    region: "br",
    accountPool,
    cookieStore,
    proxyPool,
  });

  if (!session) {
    console.log("❌ Could not acquire auth session");
    return;
  }

  console.log(`✅ Auth session acquired`);
  console.log(`   Account: ${session.account.id}`);
  console.log(`   Cookies: ${session.cookies.length}`);
  console.log(`   Proxy: ${session.proxy || "direct"}`);

  // Build search URL
  const searchUrls: Record<string, string> = {
    temu: `https://www.temu.com/br/search_result.html?search_key=${encodeURIComponent(query)}`,
    shein: `https://br.shein.com/pdsearch/${encodeURIComponent(query)}/`,
    shopee: `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
  };

  const searchUrl = searchUrls[platform];
  if (!searchUrl) {
    console.log(`❌ No search URL template for platform: ${platform}`);
    return;
  }

  console.log(`\nFetching: ${searchUrl}\n`);

  // Use Camoufox with the session cookies
  const result = await fetchWithCamoufox({
    url: searchUrl,
    cookies: session.cookies,
    proxy: session.proxy ?? undefined,
    humanize: true,
    timeout: 60,
    maxChars: 200000,
  });

  if (!result) {
    console.log("❌ Camoufox fetch failed");
    return;
  }

  console.log(`Status: ${result.status}`);
  console.log(`HTML: ${result.text.length} chars`);
  console.log(`Title: ${result.title}`);
  console.log(`Cookies from response: ${result.cookies.length}`);

  // Basic analysis
  const text = result.text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  console.log(`\nText content: ${text.length} chars`);

  // Check for login redirect
  const isLoginPage =
    result.text.toLowerCase().includes("login") &&
    (result.title?.toLowerCase().includes("login") ||
      result.title?.toLowerCase().includes("cadastro"));

  if (isLoginPage) {
    console.log("⚠️  Redirected to login page - cookies may be invalid");
    accountPool.markNeedsRelogin(session.account.id);
  } else {
    console.log("✅ Not on login page - auth appears to work!");
    console.log(`\nPreview (first 500 chars):\n${text.substring(0, 500)}...`);
  }

  cookieStore.close();
}

async function main() {
  await showStatus();

  if (loginOnly && platformArg) {
    await testLogin(platformArg);
  } else if (searchArg && platformArg) {
    await testSearch(platformArg, searchArg);
  } else if (allPlatforms) {
    for (const platform of getSupportedPlatforms()) {
      const pool = loadAccountPool();
      if (pool.getAccount(platform)) {
        await testLogin(platform);
      } else {
        console.log(`\n⏭️  Skipping ${platform} (no accounts)`);
      }
    }
  } else if (!platformArg) {
    console.log("Usage:");
    console.log("  --platform <name> --login-only    Test login");
    console.log("  --platform <name> --search <q>    Test search");
    console.log("  --all                             Test all platforms");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
