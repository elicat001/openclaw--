#!/usr/bin/env tsx
/**
 * Discovery mode — find arbitrage opportunities without knowing product keywords.
 *
 * 1. Crawl Amazon US Bestsellers for a category
 * 2. Extract keyword clusters from product names
 * 3. For each keyword: crawl US + BR, run opportunity analysis
 * 4. Output a ranked arbitrage discovery report
 *
 * Usage:
 *   npx tsx scripts/discover.ts --category home --max-keywords 10 --max-per-keyword 50
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { estimateCostForNewEntry } from "./cost.ts";
import { amazonBr } from "./crawlers/amazon-br.ts";
import { crawlBestsellers } from "./crawlers/amazon-us.ts";
import { amazonUs } from "./crawlers/amazon-us.ts";
import type { RawProduct, BestsellerItem } from "./crawlers/types.ts";
import {
  loadUSData,
  loadBRData,
  analyzeStrategyA,
  analyzeStrategyB,
  median,
  parseBRPrice,
  parseReviewCount,
  type BRProduct,
} from "./opportunity.ts";

// ── Category mapping ──

const CATEGORY_SLUGS: Record<string, string> = {
  home: "home-garden",
  kitchen: "kitchen",
  baby: "baby-products",
  beauty: "beauty",
  tools: "power-hand-tools",
  toys: "toys-and-games",
  sports: "sporting-goods",
  pet: "pet-supplies",
  electronics: "electronics",
  office: "office-products",
};

// Cost model category mapping (for import duty rates)
const COST_CATEGORIES: Record<string, string> = {
  home: "home",
  kitchen: "home",
  baby: "baby",
  beauty: "cosmetics",
  tools: "tools",
  toys: "toys",
  sports: "home",
  pet: "home",
  electronics: "electronics",
  office: "home",
};

// ── Keyword extraction ──

const STOP_WORDS = new Set([
  // English
  "the",
  "and",
  "with",
  "for",
  "from",
  "that",
  "this",
  "pack",
  "set",
  "count",
  "size",
  "piece",
  "inch",
  "inches",
  "lbs",
  "pounds",
  "ounce",
  "pcs",
  "pair",
  "new",
  "best",
  "premium",
  "pro",
  "ultra",
  "plus",
  "extra",
  "super",
  "deluxe",
  "free",
  "non",
  "anti",
  "multi",
  "all",
  "one",
  "two",
  "three",
  "per",
  // Units
  "oz",
  "ml",
  "cm",
  "mm",
  "qt",
  "gal",
  "pkg",
  // Generic product words
  "amazon",
  "basics",
  "brand",
  "generic",
]);

function extractKeywordClusters(items: BestsellerItem[]): string[] {
  const bigramCounts = new Map<string, number>();

  for (const item of items) {
    const words = item.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

    // Generate bigrams (2-word phrases)
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
    }
  }

  // Sort by frequency, deduplicate overlapping keywords
  const sorted = [...bigramCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const selected: string[] = [];
  const usedWords = new Set<string>();

  for (const [bigram] of sorted) {
    const words = bigram.split(" ");
    // Skip if both words already used in another keyword
    if (words.every((w) => usedWords.has(w))) continue;

    selected.push(bigram);
    for (const w of words) usedWords.add(w);
  }

  return selected;
}

// ── Per-keyword analysis ──

type KeywordResult = {
  keyword: string;
  usCount: number;
  brCount: number;
  brMedianPrice: number;
  estCost: number;
  estMarginPct: number;
  blueOceanCount: number;
  lowCompCount: number;
  arbitrageCount: number;
  bestMargin: number;
  verdict: "✅" | "⚠️" | "❌";
  topProducts: Array<{ name: string; margin: number; source: string }>;
};

async function analyzeKeyword(
  keyword: string,
  maxPerKeyword: number,
  costCategory: string,
  outputDir: string,
): Promise<KeywordResult> {
  const kwSlug = keyword.replace(/\s+/g, "-");
  const kwDir = join(outputDir, kwSlug);
  if (!existsSync(kwDir)) mkdirSync(kwDir, { recursive: true });

  // Crawl US
  console.log(`\n  [${keyword}] Crawling US...`);
  const usProducts = await amazonUs.crawl({
    keyword,
    maxProducts: maxPerKeyword,
    country: "us",
  });
  writeFileSync(join(kwDir, "amazon-us.json"), JSON.stringify(usProducts, null, 2));

  // Crawl BR
  console.log(`  [${keyword}] Crawling BR...`);
  const brProducts = await amazonBr.crawl({
    keyword,
    maxProducts: maxPerKeyword,
    country: "br",
  });
  writeFileSync(join(kwDir, "amazon-br.json"), JSON.stringify(brProducts, null, 2));

  // Convert BR raw products to BRProduct format
  const brData: BRProduct[] = brProducts.map((p) => ({
    name: p.name,
    source: p.source,
    brand: "",
    price_numeric: parseBRPrice(p.price),
    rating_numeric: parseFloat(p.rating ?? "0") || 0,
    reviews: p.reviews ?? "0",
    images: p.images,
    image_count: p.images.length,
    link: p.link,
    skus: p.skus,
    sku_count: p.skus.length,
    supply_chain: "Unknown origin",
    weight_estimate_kg: 2.0,
  }));

  // Run opportunity analysis
  const oppsA = analyzeStrategyA(usProducts, brData, costCategory);
  const oppsB = analyzeStrategyB(brData, costCategory);

  // Compute metrics
  const profitableA = oppsA.filter((o) => o.level >= 2 && o.estMarginPct > 0.1);
  const profitableB = oppsB.filter((o) => o.hasArbitrage);
  const blueOcean = profitableA.filter((o) => o.brCompetitors === 0).length;
  const lowComp = profitableA.length - blueOcean;

  const bestMarginA = oppsA.length > 0 ? Math.max(...oppsA.map((o) => o.estMarginPct)) : 0;
  const bestMarginB = oppsB.length > 0 ? Math.max(...oppsB.map((o) => o.targetMarginPct)) : 0;
  const bestMargin = Math.max(bestMarginA, bestMarginB);

  const brPrices = brData.map((p) => p.price_numeric).filter((p) => p > 0);
  const brMedianPrice = brPrices.length > 0 ? median(brPrices) : 0;
  const costEst = estimateCostForNewEntry(brMedianPrice, 2.0, costCategory);

  const totalProfitable = profitableA.length + profitableB.length;
  let verdict: "✅" | "⚠️" | "❌";
  if (totalProfitable >= 2 && bestMargin > 0.2) {
    verdict = "✅";
  } else if (totalProfitable >= 1 || bestMargin > 0.1) {
    verdict = "⚠️";
  } else {
    verdict = "❌";
  }

  // Top products
  const topProducts: Array<{ name: string; margin: number; source: string }> = [];
  for (const o of oppsA) {
    if (o.estMarginPct > 0) {
      topProducts.push({
        name: o.usProduct.name.slice(0, 50),
        margin: o.estMarginPct,
        source: "A",
      });
    }
  }
  for (const o of oppsB) {
    if (o.hasArbitrage) {
      topProducts.push({
        name: o.product.name.slice(0, 50),
        margin: o.targetMarginPct,
        source: "B",
      });
    }
  }
  topProducts.sort((a, b) => b.margin - a.margin);

  return {
    keyword,
    usCount: usProducts.length,
    brCount: brProducts.length,
    brMedianPrice,
    estCost: costEst.totalCost,
    estMarginPct: costEst.marginPct,
    blueOceanCount: blueOcean,
    lowCompCount: lowComp,
    arbitrageCount: profitableB.length,
    bestMargin,
    verdict,
    topProducts: topProducts.slice(0, 3),
  };
}

// ── Report generation ──

function generateDiscoveryReport(
  results: KeywordResult[],
  meta: { category: string; slug: string; date: string; totalKeywords: number },
): string {
  const lines: string[] = [];

  lines.push("# 品类套利发现报告");
  lines.push("");
  lines.push(`**品类**: ${meta.category} (${meta.slug})`);
  lines.push(`**扫描关键词数**: ${meta.totalKeywords}`);
  lines.push(`**Generated**: ${meta.date}`);
  lines.push("");

  // Sort by verdict then by bestMargin
  const sorted = results.toSorted((a, b) => {
    const vOrder = { "✅": 0, "⚠️": 1, "❌": 2 };
    if (vOrder[a.verdict] !== vOrder[b.verdict]) return vOrder[a.verdict] - vOrder[b.verdict];
    return b.bestMargin - a.bestMargin;
  });

  // Summary stats
  const doCount = sorted.filter((r) => r.verdict === "✅").length;
  const cautionCount = sorted.filter((r) => r.verdict === "⚠️").length;
  const noCount = sorted.filter((r) => r.verdict === "❌").length;
  lines.push(`**汇总**: ${doCount} 个建议进入，${cautionCount} 个谨慎评估，${noCount} 个不建议`);
  lines.push("");

  // Ranking table
  lines.push("## 套利排行榜");
  lines.push("");
  lines.push(
    "| # | 关键词 | BR中位价 | 全链成本 | 中位价毛利 | 蓝海机会 | 降价机会 | 最佳毛利 | 判断 |",
  );
  lines.push("|---|--------|---------|---------|-----------|---------|---------|---------|------|");

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    lines.push(
      `| ${i + 1} | ${r.keyword} | R$${r.brMedianPrice.toFixed(0)} | R$${r.estCost.toFixed(0)} | ${(r.estMarginPct * 100).toFixed(0)}% | ${r.blueOceanCount} | ${r.arbitrageCount} | ${(r.bestMargin * 100).toFixed(0)}% | ${r.verdict} |`,
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Detail per keyword
  lines.push("## 详细分析");
  lines.push("");

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    lines.push(`### ${i + 1}. ${r.keyword} ${r.verdict}`);
    lines.push("");
    lines.push(`- US 数据: ${r.usCount} 产品 | BR 数据: ${r.brCount} 产品`);
    lines.push(
      `- BR 中位价: R$${r.brMedianPrice.toFixed(0)} | 全链成本: R$${r.estCost.toFixed(0)} | 中位价毛利: ${(r.estMarginPct * 100).toFixed(0)}%`,
    );
    lines.push(
      `- 蓝海机会: ${r.blueOceanCount} | 低竞争机会: ${r.lowCompCount} | 降价套利: ${r.arbitrageCount}`,
    );

    if (r.topProducts.length > 0) {
      lines.push("- TOP 产品:");
      for (const tp of r.topProducts) {
        lines.push(`  - ${tp.name} — 毛利 ${(tp.margin * 100).toFixed(0)}%（策略${tp.source}）`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── CLI Entry ──

async function main() {
  const { values } = parseArgs({
    options: {
      category: { type: "string", short: "c" },
      "max-keywords": { type: "string", default: "10" },
      "max-per-keyword": { type: "string", default: "50" },
      "output-dir": { type: "string", short: "o" },
    },
    strict: true,
  });

  const category = values.category;
  if (!category) {
    console.error("Error: --category is required");
    console.error(`Available: ${Object.keys(CATEGORY_SLUGS).join(", ")}`);
    process.exit(1);
  }

  const slug = CATEGORY_SLUGS[category];
  if (!slug) {
    console.error(`Unknown category: ${category}`);
    console.error(`Available: ${Object.keys(CATEGORY_SLUGS).join(", ")}`);
    process.exit(1);
  }

  const maxKeywords = parseInt(values["max-keywords"]!) || 10;
  const maxPerKeyword = parseInt(values["max-per-keyword"]!) || 50;
  const costCategory = COST_CATEGORIES[category] || "home";
  const outputDir = values["output-dir"] || `/tmp/discovery-${category}`;

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  console.log("═══ Discovery Mode ═══");
  console.log(`  Category:       ${category} (${slug})`);
  console.log(`  Max keywords:   ${maxKeywords}`);
  console.log(`  Max/keyword:    ${maxPerKeyword}`);
  console.log(`  Cost category:  ${costCategory}`);
  console.log(`  Output:         ${outputDir}`);
  console.log("");

  // Step 1: Crawl bestsellers
  console.log("── Step 1: Crawl US Bestsellers ──\n");
  const bestsellers = await crawlBestsellers(slug, 50);
  console.log(`\nGot ${bestsellers.length} bestseller products\n`);

  // Step 2: Extract keywords
  console.log("── Step 2: Extract Keywords ──\n");
  const keywords = extractKeywordClusters(bestsellers).slice(0, maxKeywords);
  console.log(`Extracted ${keywords.length} keywords:`);
  for (const kw of keywords) {
    console.log(`  - ${kw}`);
  }

  // Save bestsellers and keywords
  writeFileSync(join(outputDir, "bestsellers.json"), JSON.stringify(bestsellers, null, 2));
  writeFileSync(join(outputDir, "keywords.json"), JSON.stringify(keywords, null, 2));

  // Step 3: Analyze each keyword
  console.log("\n── Step 3: Analyze Keywords ──");
  const results: KeywordResult[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    console.log(`\n[${i + 1}/${keywords.length}] "${kw}"`);

    try {
      const result = await analyzeKeyword(kw, maxPerKeyword, costCategory, outputDir);
      results.push(result);
      console.log(
        `  → ${result.verdict} BR中位价 R$${result.brMedianPrice.toFixed(0)} | 毛利 ${(result.estMarginPct * 100).toFixed(0)}% | 蓝海 ${result.blueOceanCount} | 套利 ${result.arbitrageCount}`,
      );
    } catch (err) {
      console.error(`  Error analyzing "${kw}":`, err);
    }
  }

  // Step 4: Generate report
  console.log("\n── Step 4: Generate Report ──\n");
  const date = new Date().toISOString().split("T")[0];
  const report = generateDiscoveryReport(results, {
    category,
    slug,
    date,
    totalKeywords: keywords.length,
  });

  const reportPath = join(outputDir, "discovery-report.md");
  writeFileSync(reportPath, report, "utf-8");
  console.log(`Report written to ${reportPath}`);

  // Summary
  const doCount = results.filter((r) => r.verdict === "✅").length;
  const cautionCount = results.filter((r) => r.verdict === "⚠️").length;
  console.log(
    `\n═══ Discovery Complete: ${doCount} ✅ | ${cautionCount} ⚠️ | ${results.length - doCount - cautionCount} ❌ ═══`,
  );
}

main().catch(console.error);
