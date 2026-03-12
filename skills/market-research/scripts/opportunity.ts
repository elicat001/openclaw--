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
import { estimateCostAtPrice, estimateCostForNewEntry } from "./cost.ts";
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

// USD to BRL exchange rate (approximate, for estimation only)
const USD_TO_BRL = 5.7;
const PLATFORM_COMMISSION = 0.16;

type OpportunityA = {
  usProduct: { name: string; price: number; rating: number; reviews: number; link: string };
  brCompetitors: number;
  brAvgReviews: number;
  estBRPrice: number;
  estMarginPct: number;
  estTotalCost: number;
  level: 3 | 2 | 1;
  action: string;
};

type OpportunityB = {
  product: { name: string; price: number; reviews: number; link: string; source: string };
  categoryMedianPrice: number;
  bestsellerMedianPrice: number;
  breakEvenPrice: number;
  targetPrice: number; // break-even × 1.3 (30% margin target)
  estimatedCost: number;
  targetMarginPct: number;
  hasArbitrage: boolean; // targetPrice < bestsellerMedianPrice
  reasons: string[];
  level: 3 | 2 | 1;
};

// Unified shape for BR data regardless of whether it came from cleaned.json or raw JSONs
export type BRProduct = {
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

export function parseReviewCount(reviews: string): number {
  // "3,200" -> 3200, "1.500" -> 1500, "500" -> 500
  return parseInt(reviews.replace(/[.,]/g, "")) || 0;
}

function parseUSPrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, "")) || 0;
}

export function parseBRPrice(price: string): number {
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

export function median(values: number[]): number {
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

export function loadUSData(filePath: string): RawProduct[] {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as RawProduct[];
}

export function loadBRData(dirPath: string): { products: BRProduct[]; isCleaned: boolean } {
  const cleanedPath = join(dirPath, "cleaned.json");

  if (existsSync(cleanedPath)) {
    const raw = readFileSync(cleanedPath, "utf-8");
    const cleaned = JSON.parse(raw) as CleanedProduct[];
    // Filter out US products (they have amazon.com/dp/ links, not amazon.com.br/dp/)
    const brOnly = cleaned.filter((p) => !p.link.includes("amazon.com/dp/"));
    return {
      isCleaned: true,
      products: brOnly.map((p) => ({
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

  // Load BR JSON files in directory (exclude US data and cleaned.json)
  const files = readdirSync(dirPath).filter(
    (f) => f.endsWith(".json") && !f.includes("amazon-us") && f !== "cleaned.json",
  );
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

export function analyzeStrategyA(
  usProducts: RawProduct[],
  brProducts: BRProduct[],
  category?: string,
): OpportunityA[] {
  // Dynamic threshold: use p75 of review counts (adaptive to category size)
  const allReviewCounts = usProducts
    .map((p) => parseReviewCount(p.reviews ?? "0"))
    .filter((r) => r > 0);
  const reviewThreshold =
    allReviewCounts.length > 0 ? Math.max(percentile(allReviewCounts, 75), 20) : 500;

  // Filter US hot sellers using dynamic threshold AND rating >= 4.0
  const hotSellers = usProducts.filter((p) => {
    const reviews = parseReviewCount(p.reviews ?? "0");
    const rating = parseFloat(p.rating ?? "0") || 0;
    return reviews >= reviewThreshold && rating >= 4.0;
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

    // Estimate BR selling price
    let estBRPrice: number;
    if (brMatches.length > 0) {
      // Has competitors: use BR competitor median price × 0.9
      const brPrices = brMatches.map((br) => br.price_numeric).filter((p) => p > 0);
      estBRPrice = brPrices.length > 0 ? median(brPrices) * 0.9 : usPrice * USD_TO_BRL * 0.7;
    } else {
      // No competitors: US price × exchange rate × 0.7 (discount for new entrant)
      estBRPrice = usPrice * USD_TO_BRL * 0.7;
    }

    // Estimate cost as Chinese OEM new entrant
    const weightKg =
      brMatches.length > 0 ? median(brMatches.map((b) => b.weight_estimate_kg)) : 0.5;
    const costEst = estimateCostForNewEntry(estBRPrice, weightKg, category);

    let level: 3 | 2 | 1;
    let action: string;

    if (brCompetitors === 0 && costEst.marginPct > 0.2) {
      level = 3;
      action = "立即切入";
    } else if (brCompetitors === 0) {
      level = 2;
      action = "蓝海但利润薄，需压缩成本";
    } else if (brCompetitors <= 5 && brAvgReviews < 50 && costEst.marginPct > 0.1) {
      level = 2;
      action = "差异化切入";
    } else {
      level = 1;
      action = "竞争激烈，转入B策略";
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
      estBRPrice,
      estMarginPct: costEst.marginPct,
      estTotalCost: costEst.totalCost,
      level,
      action,
    });
  }

  // Sort by level descending (best first), then by margin descending
  return opportunities.toSorted((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    return b.estMarginPct - a.estMarginPct;
  });
}

// ── Strategy B: BR Slow Sellers x Price Gap ──

export function analyzeStrategyB(brProducts: BRProduct[], category?: string): OpportunityB[] {
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

    // Estimate cost as Chinese OEM new entrant
    const costEst = estimateCostForNewEntry(stats.bestsellerMedian, p.weight_estimate_kg, category);

    // Break-even price: total cost / (1 - platform commission)
    const breakEvenPrice = costEst.totalCost / (1 - PLATFORM_COMMISSION);
    // Target price: break-even × 1.3 (30% gross margin target)
    const targetPrice = breakEvenPrice * 1.3;
    // Arbitrage exists when target price < bestseller median price
    const hasArbitrage = targetPrice < stats.bestsellerMedian;

    const targetMarginPct =
      targetPrice > 0
        ? (targetPrice - costEst.totalCost - targetPrice * PLATFORM_COMMISSION) / targetPrice
        : 0;

    let level: 3 | 2 | 1;
    if (hasArbitrage && targetPrice < stats.bestsellerMedian * 0.8) {
      level = 3; // Big arbitrage space
    } else if (hasArbitrage) {
      level = 2; // Some arbitrage space
    } else {
      level = 1; // No arbitrage
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
      breakEvenPrice,
      targetPrice,
      estimatedCost: costEst.totalCost,
      targetMarginPct,
      hasArbitrage,
      reasons,
      level,
    });
  }

  // Sort by level descending (best first), then by arbitrage space descending
  return opportunities.toSorted((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    // More arbitrage space = bestsellerMedian - targetPrice (higher is better)
    const spaceA = a.bestsellerMedianPrice - a.targetPrice;
    const spaceB = b.bestsellerMedianPrice - b.targetPrice;
    return spaceB - spaceA;
  });
}

// ── Verdict Logic ──

function generateVerdict(
  lines: string[],
  oppsA: OpportunityA[],
  oppsB: OpportunityB[],
  brProducts: BRProduct[],
  category?: string,
): void {
  // Compute metrics
  const profitableA = oppsA.filter((o) => o.level >= 2 && o.estMarginPct > 0.1);
  const profitableB = oppsB.filter((o) => o.hasArbitrage);
  const totalProfitable = profitableA.length + profitableB.length;

  const bestMarginA = oppsA.length > 0 ? Math.max(...oppsA.map((o) => o.estMarginPct)) : 0;
  const bestMarginB = oppsB.length > 0 ? Math.max(...oppsB.map((o) => o.targetMarginPct)) : 0;
  const bestMargin = Math.max(bestMarginA, bestMarginB);

  const brPrices = brProducts.map((p) => p.price_numeric).filter((p) => p > 0);
  const brMedianPrice = brPrices.length > 0 ? median(brPrices) : 0;
  const avgWeight =
    brProducts.length > 0
      ? brProducts.reduce((s, p) => s + p.weight_estimate_kg, 0) / brProducts.length
      : 0.5;
  const typicalCost = estimateCostForNewEntry(brMedianPrice, avgWeight, category);

  // Verdict logic
  let verdict: string;
  let verdictEmoji: string;
  if (totalProfitable >= 2 && bestMargin > 0.2) {
    verdict = "建议进入";
    verdictEmoji = "✅";
  } else if (totalProfitable >= 1 || bestMargin > 0.1) {
    verdict = "谨慎评估";
    verdictEmoji = "⚠️";
  } else {
    verdict = "不建议进入";
    verdictEmoji = "❌";
  }

  lines.push(`## ${verdictEmoji} 综合判断：${verdict}`);
  lines.push("");

  // Metrics table
  lines.push("### 套利空间");
  lines.push("");
  lines.push("| 指标 | 值 |");
  lines.push("|------|------|");
  lines.push(`| BR 市场中位价 | ${formatBRL(brMedianPrice)} |`);
  lines.push(`| 新进入者全链成本 | ${formatBRL(typicalCost.totalCost)} |`);
  lines.push(`| 平台佣金 (16%) | ${formatBRL(brMedianPrice * PLATFORM_COMMISSION)} |`);
  lines.push(`| 中位价毛利率 | ${(typicalCost.marginPct * 100).toFixed(0)}% |`);
  lines.push(`| 最佳机会毛利率 | ${(bestMargin * 100).toFixed(0)}% |`);
  lines.push(`| 蓝海/低竞争可盈利机会 (策略A) | ${profitableA.length} 个 |`);
  lines.push(`| 有套利空间的降价机会 (策略B) | ${profitableB.length} 个 |`);
  lines.push("");

  // Reasoning
  lines.push("### 判断依据");
  lines.push("");
  const reasons: string[] = [];
  if (profitableA.length > 0) {
    const blueOcean = profitableA.filter((o) => o.brCompetitors === 0).length;
    reasons.push(`策略A发现 ${profitableA.length} 个可盈利机会（其中 ${blueOcean} 个蓝海/0竞品）`);
  } else {
    reasons.push("策略A未发现可盈利的蓝海机会");
  }
  if (profitableB.length > 0) {
    reasons.push(`策略B发现 ${profitableB.length} 个有套利空间的降价机会`);
  } else {
    reasons.push("策略B所有降价机会均无法覆盖成本");
  }
  if (typicalCost.marginPct > 0.2) {
    reasons.push(
      `按中位价售出，预估毛利率 ${(typicalCost.marginPct * 100).toFixed(0)}%，利润空间充足`,
    );
  } else if (typicalCost.marginPct > 0) {
    reasons.push(
      `按中位价售出，预估毛利率仅 ${(typicalCost.marginPct * 100).toFixed(0)}%，利润空间有限`,
    );
  } else {
    reasons.push(
      `按中位价售出即亏损（毛利率 ${(typicalCost.marginPct * 100).toFixed(0)}%），需高于中位价定价`,
    );
  }
  if (brProducts.length < 30) {
    reasons.push(`BR 数据样本较少（${brProducts.length}条），结论可信度有限`);
  }
  for (const r of reasons) {
    lines.push(`- ${r}`);
  }
  lines.push("");

  // TOP recommendations
  const allOpps: Array<{ name: string; margin: number; level: 3 | 2 | 1; source: string }> = [];
  for (const o of oppsA) {
    if (o.estMarginPct > 0) {
      allOpps.push({
        name: o.usProduct.name.slice(0, 60),
        margin: o.estMarginPct,
        level: o.level,
        source: "策略A",
      });
    }
  }
  for (const o of oppsB) {
    if (o.hasArbitrage) {
      allOpps.push({
        name: o.product.name.slice(0, 60),
        margin: o.targetMarginPct,
        level: o.level,
        source: "策略B",
      });
    }
  }
  allOpps.sort((a, b) => b.margin - a.margin);

  // Deduplicate by name (trim to 40 chars for matching)
  const seenNames = new Set<string>();
  const uniqueOpps = allOpps.filter((o) => {
    const key = o.name.slice(0, 40);
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  if (uniqueOpps.length > 0) {
    lines.push("### TOP 推荐产品");
    lines.push("");
    for (let i = 0; i < Math.min(uniqueOpps.length, 5); i++) {
      const opp = uniqueOpps[i];
      lines.push(
        `${i + 1}. **${opp.name}** — 预估毛利 ${(opp.margin * 100).toFixed(0)}%，${levelStars(opp.level)}（${opp.source}）`,
      );
    }
    lines.push("");
  }
}

// ── Report Generation ──

function generateReport(
  oppsA: OpportunityA[],
  oppsB: OpportunityB[],
  brProducts: BRProduct[],
  meta: {
    usFile: string;
    usCount: number;
    brDir: string;
    brCount: number;
    date: string;
    category?: string;
  },
): string {
  const lines: string[] = [];

  lines.push("# Cross-Market Product Selection Opportunity Report");
  lines.push("");
  lines.push(`**Generated**: ${meta.date}`);
  lines.push(`**US Data**: ${meta.usFile} (${meta.usCount} products)`);
  lines.push(`**BR Data**: ${meta.brDir} (${meta.brCount} products)`);
  if (meta.category) {
    lines.push(`**Category**: ${meta.category}`);
  }
  lines.push("");

  // ── Executive Summary / Verdict ──
  generateVerdict(lines, oppsA, oppsB, brProducts, meta.category);

  lines.push("---");
  lines.push("");

  // Strategy A
  lines.push("## A. US Hot Sellers \u00D7 Brazil Market Gap");
  lines.push("");
  lines.push(
    "**Methodology**: Products in the top quartile of reviews and 4.0+ rating on Amazon US, cross-referenced against Brazil market presence.",
  );
  lines.push("");

  if (oppsA.length > 0) {
    lines.push(
      "| Level | US Product | Reviews | US Price | BR Competitors | Est. BR Price | Est. Margin | Action |",
    );
    lines.push(
      "|-------|-----------|---------|----------|---------------|--------------|------------|--------|",
    );

    for (const opp of oppsA) {
      const competitorInfo =
        opp.brCompetitors === 0
          ? "0 (蓝海)"
          : `${opp.brCompetitors} (avg ${Math.round(opp.brAvgReviews)} reviews)`;
      const marginStr =
        opp.estMarginPct >= 0
          ? `${(opp.estMarginPct * 100).toFixed(0)}%`
          : `${(opp.estMarginPct * 100).toFixed(0)}%`;
      lines.push(
        `| ${levelStars(opp.level)} | ${opp.usProduct.name.slice(0, 50)} | ${formatNumber(opp.usProduct.reviews)} | ${formatUSD(opp.usProduct.price)} | ${competitorInfo} | ${formatBRL(opp.estBRPrice)} | ${marginStr} | ${opp.action} |`,
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
      "| Level | Product | Source | Current Price | Bestseller Median | Break-even | Target Price (30%) | Arbitrage? | Reasons |",
    );
    lines.push(
      "|-------|---------|--------|--------------|------------------|-----------|-------------------|-----------|---------|",
    );

    for (const opp of oppsB) {
      const arbitrageStr = opp.hasArbitrage ? "✅ 有空间" : "❌ 无空间";
      lines.push(
        `| ${levelStars(opp.level)} | ${opp.product.name.slice(0, 45)} | ${opp.product.source} | ${formatBRL(opp.product.price)} | ${formatBRL(opp.bestsellerMedianPrice)} | ${formatBRL(opp.breakEvenPrice)} | ${formatBRL(opp.targetPrice)} | ${arbitrageStr} | ${opp.reasons.join(", ")} |`,
      );
    }
  } else {
    lines.push("*No price-gap opportunities found matching the criteria.*");
  }

  const profitableOpps = oppsB.filter((o) => o.hasArbitrage).length;
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
  lines.push("- Import duty: category-aware rates (20-60% ICMS + II)");
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
      category: { type: "string" },
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
  const category = values.category;

  console.log(`Loading US data from ${usDataPath}...`);
  const usProducts = loadUSData(usDataPath);
  console.log(`  -> ${usProducts.length} US products loaded`);

  console.log(`Loading BR data from ${brDataDir}...`);
  const { products: brProducts, isCleaned } = loadBRData(brDataDir);
  console.log(`  -> ${brProducts.length} BR products loaded (${isCleaned ? "cleaned" : "raw"})`);
  if (category) {
    console.log(`  Category: ${category}`);
  }

  console.log("\nRunning Strategy A: US Hot Sellers x BR Blank...");
  const oppsA = analyzeStrategyA(usProducts, brProducts, category);
  console.log(`  -> ${oppsA.length} opportunities found`);
  console.log(`     Level 3: ${oppsA.filter((o) => o.level === 3).length}`);
  console.log(`     Level 2: ${oppsA.filter((o) => o.level === 2).length}`);
  console.log(`     Level 1: ${oppsA.filter((o) => o.level === 1).length}`);

  console.log("\nRunning Strategy B: BR Slow Sellers x Price Gap...");
  const oppsB = analyzeStrategyB(brProducts, category);
  console.log(`  -> ${oppsB.length} opportunities found`);
  console.log(`     Level 3: ${oppsB.filter((o) => o.level === 3).length}`);
  console.log(`     Level 2: ${oppsB.filter((o) => o.level === 2).length}`);
  console.log(`     Level 1: ${oppsB.filter((o) => o.level === 1).length}`);

  const date = new Date().toISOString().split("T")[0];
  const report = generateReport(oppsA, oppsB, brProducts, {
    usFile: usDataPath,
    usCount: usProducts.length,
    brDir: brDataDir,
    brCount: brProducts.length,
    date,
    category,
  });

  writeFileSync(outputPath, report, "utf-8");
  console.log(`\nReport written to ${outputPath}`);
}

// Only run main when executed directly (not when imported)
const isDirectRun = process.argv[1]?.endsWith("opportunity.ts");
if (isDirectRun) main();
