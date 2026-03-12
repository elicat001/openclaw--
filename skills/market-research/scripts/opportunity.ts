#!/usr/bin/env tsx
/**
 * Cross-market product selection opportunity analysis.
 * Compares US hot sellers against Brazil market presence, and identifies
 * price-gap opportunities among BR slow sellers.
 *
 * Usage:
 *   pnpm tsx opportunity.ts --us-data <file> --br-data <dir> --output <file>
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseArgs } from "node:util";
import { estimateCostAtPrice } from "./cost.ts";
import type { RawProduct } from "./crawlers/types.ts";

// ── Types ──

type CleanedProduct = {
  name: string;
  source: string;
  brand: string;
  type: string;
  power_source: string;
  voltage: string;
  wattage: number;
  chuck_size: string;
  is_professional: boolean;
  has_case: boolean;
  price: string;
  price_numeric: number;
  price_suspect: boolean;
  price_missing: boolean;
  original_price: string;
  discount_pct: number;
  rating: string;
  rating_numeric: number;
  reviews: string;
  sold: string;
  images: string[];
  image_count: number;
  link: string;
  skus: Array<{ name: string; price?: string; id?: string }>;
  sku_count: number;
  supply_chain: string;
  weight_estimate_kg: number;
};

type OpportunityA = {
  usProduct: { name: string; price: number; rating: number; reviews: number; link: string };
  brCompetitors: number;
  brAvgReviews: number;
  level: 3 | 2 | 1;
  action: string;
};

type OpportunityB = {
  product: { name: string; price: number; reviews: number; link: string; source: string };
  categoryMedianPrice: number;
  bestsellerMedianPrice: number;
  suggestedPrice: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginPct: number;
  reasons: string[];
  level: 3 | 2 | 1;
};

// Unified shape for BR data regardless of whether it came from cleaned.json or raw JSONs
type BRProduct = {
  name: string;
  source: string;
  brand: string;
  price_numeric: number;
  rating_numeric: number;
  reviews: string;
  images: string[];
  image_count: number;
  link: string;
  skus: Array<{ name: string; price?: string; id?: string }>;
  sku_count: number;
  supply_chain: string;
  weight_estimate_kg: number;
};

// ── Helpers ──

function parseReviewCount(reviews: string): number {
  // "3,200" -> 3200, "1.500" -> 1500, "500" -> 500
  return parseInt(reviews.replace(/[.,]/g, "")) || 0;
}

function parseUSPrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, "")) || 0;
}

function parseBRPrice(price: string): number {
  return (
    parseFloat(
      price
        .replace(/R\$|US\$|\$|€|£/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim(),
    ) || 0
  );
}

function extractKeywords(name: string): string[] {
  const stopWords = new Set([
    "com",
    "para",
    "the",
    "and",
    "with",
    "for",
    "kit",
    "set",
    "pack",
    "novo",
    "nova",
    "new",
  ]);
  return name
    .toLowerCase()
    .split(/[\s,/+\-()]+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w));
}

function keywordOverlap(kw1: string[], kw2: string[]): number {
  const set2 = new Set(kw2);
  const matches = kw1.filter((w) => set2.has(w)).length;
  return kw1.length > 0 ? matches / kw1.length : 0;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatBRL(value: number): string {
  return `R$${value.toFixed(0)}`;
}

function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

function levelStars(level: 3 | 2 | 1): string {
  if (level === 3) {
    return "\u2B50\u2B50\u2B50";
  }
  if (level === 2) {
    return "\u2B50\u2B50";
  }
  return "\u2B50";
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ── Data Loading ──

function loadUSData(filePath: string): RawProduct[] {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as RawProduct[];
}

function loadBRData(dirPath: string): { products: BRProduct[]; isCleaned: boolean } {
  const cleanedPath = join(dirPath, "cleaned.json");

  if (existsSync(cleanedPath)) {
    const raw = readFileSync(cleanedPath, "utf-8");
    const cleaned = JSON.parse(raw) as CleanedProduct[];
    return {
      isCleaned: true,
      products: cleaned.map((p) => ({
        name: p.name,
        source: p.source,
        brand: p.brand,
        price_numeric: p.price_numeric,
        rating_numeric: p.rating_numeric,
        reviews: p.reviews,
        images: p.images,
        image_count: p.image_count,
        link: p.link,
        skus: p.skus,
        sku_count: p.sku_count,
        supply_chain: p.supply_chain,
        weight_estimate_kg: p.weight_estimate_kg,
      })),
    };
  }

  // Load all JSON files in directory as RawProduct[]
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".json"));
  const products: BRProduct[] = [];

  for (const file of files) {
    const raw = readFileSync(join(dirPath, file), "utf-8");
    const items = JSON.parse(raw) as RawProduct[];
    const source = basename(file, ".json");

    for (const p of items) {
      products.push({
        name: p.name,
        source: p.source || source,
        brand: "", // Unknown from raw data
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
      });
    }
  }

  return { products, isCleaned: false };
}

// ── Strategy A: US Hot x BR Blank ──

function analyzeStrategyA(usProducts: RawProduct[], brProducts: BRProduct[]): OpportunityA[] {
  // Filter US hot sellers: reviews > 500 AND rating >= 4.0
  const hotSellers = usProducts.filter((p) => {
    const reviews = parseReviewCount(p.reviews ?? "0");
    const rating = parseFloat(p.rating ?? "0") || 0;
    return reviews > 500 && rating >= 4.0;
  });

  const opportunities: OpportunityA[] = [];

  for (const us of hotSellers) {
    const usKeywords = extractKeywords(us.name);
    const usPrice = parseUSPrice(us.price);
    const usRating = parseFloat(us.rating ?? "0") || 0;
    const usReviews = parseReviewCount(us.reviews ?? "0");

    // Find BR competitors via brand match or keyword overlap
    const usBrandWords = us.name.toLowerCase().split(/\s+/);
    const brMatches = brProducts.filter((br) => {
      // Brand match (case-insensitive): check if any BR brand word appears in US name
      if (br.brand && br.brand.length > 0) {
        const brBrandLower = br.brand.toLowerCase();
        if (usBrandWords.some((w) => w === brBrandLower)) {
          return true;
        }
      }
      // Keyword overlap > 40%
      const brKeywords = extractKeywords(br.name);
      return keywordOverlap(usKeywords, brKeywords) > 0.4;
    });

    const brCompetitors = brMatches.length;
    const brAvgReviews =
      brMatches.length > 0
        ? brMatches.reduce((sum, br) => sum + parseReviewCount(br.reviews), 0) / brMatches.length
        : 0;

    let level: 3 | 2 | 1;
    let action: string;

    if (brCompetitors === 0) {
      level = 3;
      action = "\u7ACB\u5373\u5207\u5165";
    } else if (brCompetitors <= 5 && brAvgReviews < 50) {
      level = 2;
      action = "\u5DEE\u5F02\u5316\u5207\u5165";
    } else {
      level = 1;
      action = "\u7ADE\u4E89\u6FC0\u70C8\uFF0C\u8F6C\u5165B\u7B56\u7565";
    }

    opportunities.push({
      usProduct: {
        name: us.name,
        price: usPrice,
        rating: usRating,
        reviews: usReviews,
        link: us.link,
      },
      brCompetitors,
      brAvgReviews,
      level,
      action,
    });
  }

  // Sort by level descending (best first), then by reviews descending
  return opportunities.toSorted((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    return b.usProduct.reviews - a.usProduct.reviews;
  });
}

// ── Strategy B: BR Slow Sellers x Price Gap ──

function analyzeStrategyB(brProducts: BRProduct[]): OpportunityB[] {
  // Group by source to compute per-source statistics
  const bySource = new Map<string, BRProduct[]>();
  for (const p of brProducts) {
    const key = p.source;
    if (!bySource.has(key)) {
      bySource.set(key, []);
    }
    bySource.get(key)!.push(p);
  }

  // Compute per-source p75, median, and bestseller median
  const sourceStats = new Map<
    string,
    { p75: number; median: number; bestsellerMedian: number; avgSkuCount: number }
  >();
  for (const [source, products] of bySource) {
    const prices = products.map((p) => p.price_numeric).filter((p) => p > 0);
    const p75 = percentile(prices, 75);
    const med = median(prices);

    // Bestsellers: products with reviews >= 50
    const bestsellerPrices = products
      .filter((p) => parseReviewCount(p.reviews) >= 50 && p.price_numeric > 0)
      .map((p) => p.price_numeric);
    const bestsellerMed = bestsellerPrices.length > 0 ? median(bestsellerPrices) : med;

    const avgSkuCount =
      products.length > 0 ? products.reduce((sum, p) => sum + p.sku_count, 0) / products.length : 0;

    sourceStats.set(source, { p75, median: med, bestsellerMedian: bestsellerMed, avgSkuCount });
  }

  const opportunities: OpportunityB[] = [];

  for (const p of brProducts) {
    const reviewCount = parseReviewCount(p.reviews);
    const stats = sourceStats.get(p.source);
    if (!stats) {
      continue;
    }

    // Slow sellers: reviews < 20 AND price > p75
    if (reviewCount >= 20 || p.price_numeric <= stats.p75 || p.price_numeric <= 0) {
      continue;
    }

    // Diagnose reasons
    const reasons: string[] = [];
    if (p.price_numeric > stats.median * 1.5) {
      reasons.push("\u4EF7\u683C\u8FC7\u9AD8");
    }
    if (p.image_count < 3) {
      reasons.push("\u56FE\u7247\u4E0D\u8DB3");
    }
    if (p.sku_count === 0 && stats.avgSkuCount > 0) {
      reasons.push("\u7F3A\u5C11SKU\u53D8\u4F53");
    }

    if (reasons.length === 0) {
      reasons.push("\u4F4E\u8BC4\u8BBA+\u9AD8\u4EF7");
    }

    // Suggested price: bestseller median * 0.85
    const suggestedPrice = stats.bestsellerMedian * 0.85;

    // Estimate cost at suggested price
    const costInput = {
      price_numeric: p.price_numeric,
      supply_chain: p.supply_chain,
      weight_estimate_kg: p.weight_estimate_kg,
    };
    const costEst = estimateCostAtPrice(suggestedPrice, costInput);

    let level: 3 | 2 | 1;
    if (suggestedPrice > costEst.totalCost * 2) {
      level = 3;
    } else if (suggestedPrice > costEst.totalCost * 1.5) {
      level = 2;
    } else {
      level = 1;
    }

    opportunities.push({
      product: {
        name: p.name,
        price: p.price_numeric,
        reviews: reviewCount,
        link: p.link,
        source: p.source,
      },
      categoryMedianPrice: stats.median,
      bestsellerMedianPrice: stats.bestsellerMedian,
      suggestedPrice,
      estimatedCost: costEst.totalCost,
      estimatedMargin: costEst.margin,
      marginPct: costEst.marginPct,
      reasons,
      level,
    });
  }

  // Sort by level descending (best first), then by marginPct descending
  return opportunities.toSorted((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    return b.marginPct - a.marginPct;
  });
}

// ── Report Generation ──

function generateReport(
  oppsA: OpportunityA[],
  oppsB: OpportunityB[],
  meta: { usFile: string; usCount: number; brDir: string; brCount: number; date: string },
): string {
  const lines: string[] = [];

  lines.push("# Cross-Market Product Selection Opportunity Report");
  lines.push("");
  lines.push(`**Generated**: ${meta.date}`);
  lines.push(`**US Data**: ${meta.usFile} (${meta.usCount} products)`);
  lines.push(`**BR Data**: ${meta.brDir} (${meta.brCount} products)`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Strategy A
  lines.push("## A. US Hot Sellers \u00D7 Brazil Market Gap");
  lines.push("");
  lines.push(
    "**Methodology**: Products with 500+ reviews and 4.0+ rating on Amazon US, cross-referenced against Brazil market presence.",
  );
  lines.push("");

  if (oppsA.length > 0) {
    lines.push("| Level | US Product | Reviews | Rating | US Price | BR Competitors | Action |");
    lines.push("|-------|-----------|---------|--------|----------|---------------|--------|");

    for (const opp of oppsA) {
      const competitorInfo =
        opp.brCompetitors === 0
          ? "0"
          : `${opp.brCompetitors} (avg ${Math.round(opp.brAvgReviews)} reviews)`;
      lines.push(
        `| ${levelStars(opp.level)} | ${opp.usProduct.name.slice(0, 60)} | ${formatNumber(opp.usProduct.reviews)} | ${opp.usProduct.rating.toFixed(1)} | ${formatUSD(opp.usProduct.price)} | ${competitorInfo} | ${opp.action} |`,
      );
    }
  } else {
    lines.push("*No US hot sellers found matching the criteria.*");
  }

  const blueOcean = oppsA.filter((o) => o.level === 3).length;
  const lowComp = oppsA.filter((o) => o.level === 2).length;
  lines.push("");
  lines.push(
    `**Summary**: ${blueOcean} blue ocean opportunities, ${lowComp} low-competition entries found.`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Strategy B
  lines.push("## B. Brazil Slow Sellers \u00D7 Price Gap Opportunities");
  lines.push("");
  lines.push(
    "**Methodology**: BR products with <20 reviews and price above 75th percentile, analyzed for price reduction opportunity.",
  );
  lines.push("");

  if (oppsB.length > 0) {
    lines.push(
      "| Level | Product | Source | Current Price | Category Median | Suggested Price | Est. Cost | Est. Margin | Reasons |",
    );
    lines.push(
      "|-------|---------|--------|--------------|----------------|----------------|----------|------------|---------|",
    );

    for (const opp of oppsB) {
      lines.push(
        `| ${levelStars(opp.level)} | ${opp.product.name.slice(0, 50)} | ${opp.product.source} | ${formatBRL(opp.product.price)} | ${formatBRL(opp.categoryMedianPrice)} | ${formatBRL(opp.suggestedPrice)} | ${formatBRL(opp.estimatedCost)} | ${(opp.marginPct * 100).toFixed(0)}% | ${opp.reasons.join(", ")} |`,
      );
    }
  } else {
    lines.push("*No price-gap opportunities found matching the criteria.*");
  }

  const profitableOpps = oppsB.filter((o) => o.level >= 2).length;
  lines.push("");
  lines.push(`**Summary**: ${profitableOpps} profitable price-gap opportunities found.`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Cost estimation notes
  lines.push("## C. Cost Estimation Notes");
  lines.push("");
  lines.push("- Factory cost: based on supply chain origin heuristics (confidence: medium)");
  lines.push("- Shipping: R$8/kg sea freight average");
  lines.push("- Import duty: 60% (ICMS + II for electronics/tools)");
  lines.push("- FBA: weight-based tier pricing");
  lines.push("- Platform commission: 16%");
  lines.push("- **Calibrate with 1688 data for higher confidence**");
  lines.push("");

  return lines.join("\n");
}

// ── CLI Entry ──

function main() {
  const { values } = parseArgs({
    options: {
      "us-data": { type: "string" },
      "br-data": { type: "string" },
      output: { type: "string" },
    },
    strict: true,
  });

  const usDataPath = values["us-data"];
  const brDataDir = values["br-data"];

  if (!usDataPath || !brDataDir) {
    console.error(
      "Usage: pnpm tsx opportunity.ts --us-data <file> --br-data <dir> [--output <file>]",
    );
    process.exit(1);
  }

  if (!existsSync(usDataPath)) {
    console.error(`US data file not found: ${usDataPath}`);
    process.exit(1);
  }

  if (!existsSync(brDataDir)) {
    console.error(`BR data directory not found: ${brDataDir}`);
    process.exit(1);
  }

  const outputPath = values.output ?? join(brDataDir, "opportunity-report.md");

  console.log(`Loading US data from ${usDataPath}...`);
  const usProducts = loadUSData(usDataPath);
  console.log(`  -> ${usProducts.length} US products loaded`);

  console.log(`Loading BR data from ${brDataDir}...`);
  const { products: brProducts, isCleaned } = loadBRData(brDataDir);
  console.log(`  -> ${brProducts.length} BR products loaded (${isCleaned ? "cleaned" : "raw"})`);

  console.log("\nRunning Strategy A: US Hot Sellers x BR Blank...");
  const oppsA = analyzeStrategyA(usProducts, brProducts);
  console.log(`  -> ${oppsA.length} opportunities found`);
  console.log(`     Level 3: ${oppsA.filter((o) => o.level === 3).length}`);
  console.log(`     Level 2: ${oppsA.filter((o) => o.level === 2).length}`);
  console.log(`     Level 1: ${oppsA.filter((o) => o.level === 1).length}`);

  console.log("\nRunning Strategy B: BR Slow Sellers x Price Gap...");
  const oppsB = analyzeStrategyB(brProducts);
  console.log(`  -> ${oppsB.length} opportunities found`);
  console.log(`     Level 3: ${oppsB.filter((o) => o.level === 3).length}`);
  console.log(`     Level 2: ${oppsB.filter((o) => o.level === 2).length}`);
  console.log(`     Level 1: ${oppsB.filter((o) => o.level === 1).length}`);

  const date = new Date().toISOString().split("T")[0];
  const report = generateReport(oppsA, oppsB, {
    usFile: usDataPath,
    usCount: usProducts.length,
    brDir: brDataDir,
    brCount: brProducts.length,
    date,
  });

  writeFileSync(outputPath, report, "utf-8");
  console.log(`\nReport written to ${outputPath}`);
}

main();
