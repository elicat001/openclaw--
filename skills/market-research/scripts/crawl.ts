#!/usr/bin/env tsx
/**
 * Unified market research crawl entry point.
 * Supports multiple platforms and any product keyword.
 *
 * Usage:
 *   pnpm tsx crawl.ts --keyword "furadeira eletrica" --platforms amazon-br,meli --pipeline full
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { CrawlerModule, RawProduct } from "./crawlers/types.ts";

// ── CLI Args ──

const { values } = parseArgs({
  options: {
    keyword: { type: "string", short: "k" },
    platforms: { type: "string", short: "p", default: "amazon-br,meli" },
    max: { type: "string", short: "m", default: "300" },
    "output-dir": { type: "string", short: "o" },
    pipeline: { type: "string", default: "crawl" },
    country: { type: "string", default: "br" },
    proxy: { type: "string" },
    category: { type: "string" },
  },
  strict: true,
});

if (!values.keyword) {
  console.error("Error: --keyword is required\n");
  console.error("Usage: pnpm tsx crawl.ts --keyword <search term> [options]");
  console.error(
    "  --platforms <list>    Comma-separated: amazon-br,meli (default: amazon-br,meli)",
  );
  console.error("  --max <number>        Max products per platform (default: 300)");
  console.error(
    "  --output-dir <path>   Output directory (default: /tmp/market-research-<keyword>/)",
  );
  console.error("  --pipeline <stage>    crawl | clean | analyze | full (default: crawl)");
  console.error("  --country <code>      Country code (default: br)");
  process.exit(1);
}

const keyword = values.keyword;
const platformList = (values.platforms ?? "amazon-br,meli").split(",").map((s) => s.trim());
const maxProducts = parseInt(values.max ?? "300", 10);
const slug = keyword
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .slice(0, 40);
const outputDir = values["output-dir"] ?? `/tmp/market-research-${slug}`;
const pipeline = values.pipeline ?? "crawl";
const country = values.country ?? "br";
const category = values.category;

// ── Crawler Registry ──

const crawlerRegistry: Record<string, () => Promise<CrawlerModule>> = {
  "amazon-br": async () => {
    const mod = await import("./crawlers/amazon-br.ts");
    return mod.amazonBr;
  },
  meli: async () => {
    const mod = await import("./crawlers/meli.ts");
    return mod.meli;
  },
  "amazon-us": async () => {
    const mod = await import("./crawlers/amazon-us.ts");
    return mod.amazonUs;
  },
};

// ── Pipeline Stages ──

async function runCrawl(): Promise<void> {
  console.log(`═══ Market Research Crawl ═══`);
  console.log(`  Keyword:   ${keyword}`);
  console.log(`  Platforms: ${platformList.join(", ")}`);
  console.log(`  Max/platform: ${maxProducts}`);
  console.log(`  Output:    ${outputDir}/`);
  console.log();

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const allProducts: RawProduct[] = [];

  for (const platform of platformList) {
    const factory = crawlerRegistry[platform];
    if (!factory) {
      console.error(`Unknown platform: ${platform}`);
      console.error(`Available: ${Object.keys(crawlerRegistry).join(", ")}`);
      continue;
    }

    console.log(`\n── ${platform} ──\n`);
    const crawler = await factory();
    const products = await crawler.crawl({
      keyword,
      maxProducts,
      country,
      proxy: values.proxy,
    });

    const outputFile = `${outputDir}/${platform}.json`;
    writeFileSync(outputFile, JSON.stringify(products, null, 2));
    console.log(`\n[${platform}] Saved ${products.length} products → ${outputFile}`);
    allProducts.push(...products);
  }

  console.log(`\n═══ Crawl Complete: ${allProducts.length} total products ═══`);
}

async function runClean(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  const cleanScript = new URL("./clean.ts", import.meta.url).pathname;
  console.log(`\n═══ Running Clean Pipeline ═══\n`);
  execFileSync("pnpm", ["tsx", cleanScript, "--input", outputDir, "--brands", "auto"], {
    stdio: "inherit",
  });
}

async function runAnalyze(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  const analyzeScript = new URL("./analyze.ts", import.meta.url).pathname;
  const cleanedPath = `${outputDir}/cleaned.json`;
  const reportPath = `${outputDir}/report.md`;
  console.log(`\n═══ Running Analysis Pipeline ═══\n`);
  execFileSync("pnpm", ["tsx", analyzeScript, "--input", cleanedPath, "--output", reportPath], {
    stdio: "inherit",
  });
}

async function runOpportunity(): Promise<void> {
  const usDataPath = `${outputDir}/amazon-us.json`;
  if (!existsSync(usDataPath)) {
    console.log(`\n[opportunity] Skipping: no US data found at ${usDataPath}`);
    return;
  }
  const { execFileSync } = await import("node:child_process");
  const opportunityScript = new URL("./opportunity.ts", import.meta.url).pathname;
  const reportPath = `${outputDir}/opportunity-report.md`;
  console.log(`\n═══ Running Opportunity Analysis ═══\n`);
  const oppArgs = [
    "tsx",
    opportunityScript,
    "--us-data",
    usDataPath,
    "--br-data",
    outputDir,
    "--output",
    reportPath,
  ];
  if (category) {
    oppArgs.push("--category", category);
  }
  execFileSync("pnpm", oppArgs, { stdio: "inherit" });
}

// ── Main ──

async function main(): Promise<void> {
  if (pipeline === "crawl" || pipeline === "full") {
    await runCrawl();
  }
  if (pipeline === "clean" || pipeline === "full") {
    await runClean();
  }
  if (pipeline === "analyze" || pipeline === "full") {
    await runAnalyze();
  }
  if (pipeline === "opportunity" || pipeline === "full") {
    await runOpportunity();
  }
}

main().catch((e: unknown) => {
  console.error(String(e));
  process.exit(1);
});
