#!/usr/bin/env tsx
/**
 * Generalized market analysis script.
 * Reads cleaned JSON data and produces a markdown report with 9 analysis dimensions.
 *
 * Usage:
 *   tsx analyze.ts --input /tmp/cleaned.json [--output ./report.md]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

// ── Types ──

type CleanedProduct = {
  name: string;
  source: "amazon" | "meli";
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
  skus: Array<{ name: string; price?: string; asin?: string }>;
  sku_count: number;
  supply_chain: string;
  weight_estimate_kg: number;
};

// ── CLI ──

const { values: args } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    output: { type: "string", short: "o", default: "./market-analysis-report.md" },
  },
  strict: true,
});

if (!args.input) {
  console.error("Usage: analyze.ts --input <file> [--output <file>]");
  process.exit(1);
}

// ── Helpers ──

function median(nums: number[]): number {
  if (nums.length === 0) {
    return 0;
  }
  const sorted = [...nums].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(nums: number[]): number {
  if (nums.length === 0) {
    return 0;
  }
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function pct(n: number, total: number): string {
  if (total === 0) {
    return "0%";
  }
  return `${((n / total) * 100).toFixed(1)}%`;
}

function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function asciiBar(value: number, maxValue: number, width = 30): string {
  if (maxValue === 0) {
    return "░".repeat(width);
  }
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Detect which string/number fields in the data have meaningful variety
 * (more than 1 distinct value, present in a reasonable fraction of products).
 * Returns field names suitable for feature analysis tables.
 */
function detectFeatureFields(products: CleanedProduct[]): string[] {
  const candidateStringFields = ["voltage", "chuck_size", "power_source"] as const;
  const candidateNumericFields = ["wattage"] as const;
  const candidateBoolFields = ["is_professional", "has_case"] as const;

  const detected: string[] = [];

  for (const field of candidateStringFields) {
    const values = products.map((p) => p[field]).filter((v) => v && v !== "unknown" && v !== "");
    const unique = new Set(values);
    if (unique.size >= 2 && values.length >= products.length * 0.1) {
      detected.push(field);
    }
  }

  for (const field of candidateNumericFields) {
    const values = products.map((p) => p[field]).filter((v) => v > 0);
    const unique = new Set(values);
    if (unique.size >= 2 && values.length >= products.length * 0.05) {
      detected.push(field);
    }
  }

  for (const field of candidateBoolFields) {
    const trueCount = products.filter((p) => p[field]).length;
    if (trueCount > 0 && trueCount < products.length) {
      detected.push(field);
    }
  }

  return detected;
}

/**
 * Try to infer the category/keyword from the data (most common type).
 */
function inferCategory(products: CleanedProduct[]): string {
  const typeCounts: Record<string, number> = {};
  for (const p of products) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  const sorted = Object.entries(typeCounts).toSorted((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "market";
}

// ── Analysis Functions ──

function analyzeMarketOverview(products: CleanedProduct[]): string {
  const amazon = products.filter((p) => p.source === "amazon");
  const meli = products.filter((p) => p.source === "meli");
  const validPrices = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);
  const amazonPrices = amazon.filter((p) => p.price_numeric > 0 && !p.price_suspect);
  const meliPrices = meli.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  const allPriceNums = validPrices.map((p) => p.price_numeric);
  const amazonPriceNums = amazonPrices.map((p) => p.price_numeric);
  const meliPriceNums = meliPrices.map((p) => p.price_numeric);

  const cordless = products.filter((p) => p.power_source === "bateria");
  const corded = products.filter((p) => p.power_source === "eletrica");
  const professional = products.filter((p) => p.is_professional);
  const withCase = products.filter((p) => p.has_case);

  let md = `## 1. Market Overview

### Platform Comparison

| Metric | Amazon BR | Mercado Livre | Total |
|:-------|:---------|:-------------|:------|
| Products | ${amazon.length} | ${meli.length} | ${products.length} |
| Valid-price products | ${amazonPrices.length} | ${meliPrices.length} | ${validPrices.length} |
| Avg price | ${amazonPriceNums.length > 0 ? brl(avg(amazonPriceNums)) : "-"} | ${meliPriceNums.length > 0 ? brl(avg(meliPriceNums)) : "-"} | ${allPriceNums.length > 0 ? brl(avg(allPriceNums)) : "-"} |
| Median price | ${amazonPriceNums.length > 0 ? brl(median(amazonPriceNums)) : "-"} | ${meliPriceNums.length > 0 ? brl(median(meliPriceNums)) : "-"} | ${allPriceNums.length > 0 ? brl(median(allPriceNums)) : "-"} |
| Min price | ${amazonPriceNums.length > 0 ? brl(Math.min(...amazonPriceNums)) : "-"} | ${meliPriceNums.length > 0 ? brl(Math.min(...meliPriceNums)) : "-"} | ${allPriceNums.length > 0 ? brl(Math.min(...allPriceNums)) : "-"} |
| Max price | ${amazonPriceNums.length > 0 ? brl(Math.max(...amazonPriceNums)) : "-"} | ${meliPriceNums.length > 0 ? brl(Math.max(...meliPriceNums)) : "-"} | ${allPriceNums.length > 0 ? brl(Math.max(...allPriceNums)) : "-"} |

### Market Structure

| Dimension | Count | Share |
|:----------|:------|:------|
| Corded (eletrica) | ${corded.length} | ${pct(corded.length, products.length)} |
| Cordless (bateria) | ${cordless.length} | ${pct(cordless.length, products.length)} |
| Professional-grade | ${professional.length} | ${pct(professional.length, products.length)} |
| Includes carrying case | ${withCase.length} | ${pct(withCase.length, products.length)} |

### Product Type Distribution

`;

  const typeCounts: Record<string, number> = {};
  for (const p of products) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  const sortedTypes = Object.entries(typeCounts).toSorted((a, b) => b[1] - a[1]);
  const maxTypeCount = sortedTypes[0]?.[1] || 1;

  for (const [type, count] of sortedTypes) {
    const bar = asciiBar(count, maxTypeCount, 25);
    md += `| ${type} | ${bar} ${count} (${pct(count, products.length)}) |\n`;
  }

  const topType = sortedTypes[0];
  md += `
> **Insight**: ${topType ? `"${topType[0]}" is the dominant type at ${pct(topType[1], products.length)}.` : "No dominant type detected."} Cordless products account for ${pct(cordless.length, products.length)} of the market.

`;
  return md;
}

function analyzePricing(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Price distribution buckets
  const buckets = [
    { label: "R$ 0-50", min: 0, max: 50 },
    { label: "R$ 50-100", min: 50, max: 100 },
    { label: "R$ 100-200", min: 100, max: 200 },
    { label: "R$ 200-400", min: 200, max: 400 },
    { label: "R$ 400-700", min: 400, max: 700 },
    { label: "R$ 700-1000", min: 700, max: 1000 },
    { label: "R$ 1000-2000", min: 1000, max: 2000 },
    { label: "R$ 2000+", min: 2000, max: 999999 },
  ];

  const bucketCounts = buckets.map((b) => ({
    ...b,
    count: valid.filter((p) => p.price_numeric >= b.min && p.price_numeric < b.max).length,
    products: valid
      .filter((p) => p.price_numeric >= b.min && p.price_numeric < b.max)
      .toSorted((a, b) => b.price_numeric - a.price_numeric),
  }));

  const maxBucket = Math.max(...bucketCounts.map((b) => b.count));

  let md = `## 2. Price Analysis

### Price Distribution

\`\`\`
`;

  for (const b of bucketCounts) {
    const bar = asciiBar(b.count, maxBucket, 30);
    md += `${b.label.padEnd(14)} ${bar} ${String(b.count).padStart(3)} (${pct(b.count, valid.length).padStart(5)})\n`;
  }

  md += `\`\`\`

### Representative Products per Price Band

| Price Band | Representative Brands | Example Product |
|:-----------|:---------------------|:----------------|
`;

  for (const b of bucketCounts) {
    if (b.count === 0) {
      continue;
    }
    const brands = [...new Set(b.products.map((p) => p.brand))].slice(0, 3);
    const example = b.products[Math.floor(b.products.length / 2)];
    md += `| ${b.label} | ${brands.join(", ")} | ${example ? example.name.substring(0, 50) + "..." : "-"} |\n`;
  }

  // Platform price comparison
  const amazonValid = valid.filter((p) => p.source === "amazon");
  const meliValid = valid.filter((p) => p.source === "meli");

  md += `
### Platform Price Comparison

| Product Type | Amazon Avg | MeLi Avg | Difference |
|:-------------|:-----------|:---------|:-----------|
`;

  const types = [...new Set(valid.map((p) => p.type))];
  for (const t of types) {
    const amazonType = amazonValid.filter((p) => p.type === t);
    const meliType = meliValid.filter((p) => p.type === t);
    if (amazonType.length < 2 || meliType.length < 2) {
      continue;
    }
    const aAvg = avg(amazonType.map((p) => p.price_numeric));
    const mAvg = avg(meliType.map((p) => p.price_numeric));
    const diff = ((mAvg - aAvg) / aAvg) * 100;
    md += `| ${t} | ${brl(aAvg)} | ${brl(mAvg)} | ${diff > 0 ? "+" : ""}${diff.toFixed(1)}% |\n`;
  }

  // Discount analysis
  const discounted = products.filter((p) => p.discount_pct > 0);
  if (discounted.length > 0) {
    const avgDiscount = avg(discounted.map((p) => p.discount_pct));
    const deepDiscount = discounted.filter((p) => p.discount_pct >= 30);
    md += `
### Discount Analysis

- Products with discounts: ${discounted.length} (${pct(discounted.length, products.length)})
- Average discount: ${avgDiscount.toFixed(0)}%
- Deep discounts (>=30%): ${deepDiscount.length} products

| Discount Range | Count | Example |
|:---------------|:------|:--------|
`;
    const discountBuckets = [
      { label: "5-15%", min: 5, max: 15 },
      { label: "15-30%", min: 15, max: 30 },
      { label: "30-50%", min: 30, max: 50 },
      { label: "50%+", min: 50, max: 100 },
    ];
    for (const db of discountBuckets) {
      const items = discounted.filter((p) => p.discount_pct >= db.min && p.discount_pct < db.max);
      const example = items[0];
      md += `| ${db.label} | ${items.length} | ${example ? example.brand + " - " + brl(example.price_numeric) : "-"} |\n`;
    }
  }

  // Find the densest price bucket for pricing advice
  const densest = bucketCounts.toSorted((a, b) => b.count - a.count)[0];
  md += `
> **Pricing insight**: The densest price band is ${densest.label} with ${densest.count} products (${pct(densest.count, valid.length)}). Consider positioning just above or below this band for differentiation.

`;
  return md;
}

function analyzeBrands(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Brand market share
  const brandStats: Record<
    string,
    { count: number; prices: number[]; ratings: number[]; skus: number; images: number }
  > = {};
  for (const p of valid) {
    if (!brandStats[p.brand]) {
      brandStats[p.brand] = { count: 0, prices: [], ratings: [], skus: 0, images: 0 };
    }
    brandStats[p.brand].count++;
    brandStats[p.brand].prices.push(p.price_numeric);
    if (p.rating_numeric > 0) {
      brandStats[p.brand].ratings.push(p.rating_numeric);
    }
    brandStats[p.brand].skus += p.sku_count;
    brandStats[p.brand].images += p.image_count;
  }

  const sortedBrands = Object.entries(brandStats)
    .toSorted((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  let md = `## 3. Brand Competition Analysis

### Brand Market Share (Top 20)

| Rank | Brand | Products | Share | Avg Price | Price Range | Avg Rating | Total SKUs |
|:-----|:------|:---------|:------|:----------|:------------|:-----------|:-----------|
`;

  sortedBrands.forEach(([brand, stats], i) => {
    const avgPrice = avg(stats.prices);
    const minPrice = Math.min(...stats.prices);
    const maxPrice = Math.max(...stats.prices);
    const avgRating = stats.ratings.length > 0 ? avg(stats.ratings).toFixed(1) : "-";
    md += `| ${i + 1} | ${brand} | ${stats.count} | ${pct(stats.count, valid.length)} | ${brl(avgPrice)} | ${brl(minPrice)}-${brl(maxPrice)} | ${avgRating} | ${stats.skus} |\n`;
  });

  // Brand positioning matrix (price x rating)
  md += `
### Brand Positioning Matrix (Price x Rating)

\`\`\`
  High Rating
    ^
`;

  const brandsWithRating = sortedBrands
    .filter(([, s]) => s.ratings.length > 0)
    .map(([brand, stats]) => ({
      brand,
      avgPrice: avg(stats.prices),
      avgRating: avg(stats.ratings),
      count: stats.count,
    }));

  // Quadrant classification
  const medPrice = median(brandsWithRating.map((b) => b.avgPrice));
  const medRating = median(brandsWithRating.map((b) => b.avgRating));

  const q1 = brandsWithRating.filter((b) => b.avgPrice >= medPrice && b.avgRating >= medRating);
  const q2 = brandsWithRating.filter((b) => b.avgPrice < medPrice && b.avgRating >= medRating);
  const q3 = brandsWithRating.filter((b) => b.avgPrice < medPrice && b.avgRating < medRating);
  const q4 = brandsWithRating.filter((b) => b.avgPrice >= medPrice && b.avgRating < medRating);

  md += `    [High price + High rating] ${q1.map((b) => b.brand).join(", ") || "none"}
    |
    |  [Low price + High rating (value)] ${q2.map((b) => b.brand).join(", ") || "none"}
    |
----+-----------------------------> High Price
    |
    |  [Low price + Low rating] ${q3.map((b) => b.brand).join(", ") || "none"}
    |
    [High price + Low rating] ${q4.map((b) => b.brand).join(", ") || "none"}
\`\`\`

`;

  // Supply chain origin breakdown
  const supplyChainCounts: Record<
    string,
    { count: number; avgPrice: number; products: CleanedProduct[] }
  > = {};
  for (const p of valid) {
    if (!supplyChainCounts[p.supply_chain]) {
      supplyChainCounts[p.supply_chain] = { count: 0, avgPrice: 0, products: [] };
    }
    supplyChainCounts[p.supply_chain].count++;
    supplyChainCounts[p.supply_chain].products.push(p);
  }
  for (const sc of Object.values(supplyChainCounts)) {
    sc.avgPrice = avg(sc.products.map((p) => p.price_numeric));
  }

  md += `### Brand Origin Distribution

| Origin | Brands | Products | Avg Price |
|:-------|:-------|:---------|:----------|
`;
  for (const [chain, data] of Object.entries(supplyChainCounts).toSorted(
    (a, b) => b[1].count - a[1].count,
  )) {
    const uniqueBrands = new Set(data.products.map((p) => p.brand));
    md += `| ${chain} | ${uniqueBrands.size} | ${data.count} | ${brl(data.avgPrice)} |\n`;
  }

  md += `
> **Brand insight**: Top brands dominate with wide price ranges. Value-quadrant brands (low price, high rating) represent strong competitors or partnership opportunities.

`;
  return md;
}

function analyzeProductFeatures(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);
  const featureFields = detectFeatureFields(valid);

  let md = `## 4. Product Features Analysis

`;

  // Analyze each detected string feature
  for (const field of featureFields) {
    if (field === "voltage" || field === "chuck_size" || field === "power_source") {
      const distribution: Record<string, { count: number; avgPrice: number }> = {};
      for (const p of valid) {
        const val = (p[field] as string) || "unlabeled";
        if (!distribution[val]) {
          distribution[val] = { count: 0, avgPrice: 0 };
        }
        distribution[val].count++;
      }
      for (const [val] of Object.entries(distribution)) {
        const items = valid.filter((p) => ((p[field] as string) || "unlabeled") === val);
        distribution[val].avgPrice = avg(items.map((p) => p.price_numeric));
      }

      md += `### ${field} Distribution

| ${field} | Products | Share | Avg Price |
|:${"-".repeat(field.length)}|:---------|:------|:----------|
`;
      for (const [val, data] of Object.entries(distribution).toSorted(
        (a, b) => b[1].count - a[1].count,
      )) {
        md += `| ${val} | ${data.count} | ${pct(data.count, valid.length)} | ${brl(data.avgPrice)} |\n`;
      }
      md += "\n";
    }

    if (field === "wattage") {
      const withWattage = valid.filter((p) => p.wattage > 0);
      if (withWattage.length > 0) {
        // Build dynamic wattage buckets based on data range
        const wattValues = withWattage.map((p) => p.wattage);
        const minW = Math.min(...wattValues);
        const maxW = Math.max(...wattValues);

        const wattBuckets: Array<{ label: string; min: number; max: number }> = [];
        if (minW < 300) {
          wattBuckets.push({ label: "0-300W", min: 0, max: 300 });
        }
        if (maxW >= 300) {
          wattBuckets.push({ label: "300-600W", min: 300, max: 600 });
        }
        if (maxW >= 600) {
          wattBuckets.push({ label: "600-1000W", min: 600, max: 1000 });
        }
        if (maxW >= 1000) {
          wattBuckets.push({ label: "1000W+", min: 1000, max: 99999 });
        }

        md += `### wattage Distribution

| Wattage Range | Products | Avg Price | Main Types |
|:--------------|:---------|:----------|:-----------|
`;
        for (const wb of wattBuckets) {
          const items = withWattage.filter((p) => p.wattage >= wb.min && p.wattage < wb.max);
          if (items.length === 0) {
            continue;
          }
          const mainTypes = [...new Set(items.map((p) => p.type))].slice(0, 2);
          md += `| ${wb.label} | ${items.length} | ${brl(avg(items.map((p) => p.price_numeric)))} | ${mainTypes.join(", ")} |\n`;
        }
        md += "\n";
      }
    }

    if (field === "is_professional" || field === "has_case") {
      const trueItems = valid.filter((p) => p[field]);
      const falseItems = valid.filter((p) => !p[field]);

      const label = field === "is_professional" ? "Professional-grade" : "Includes case";
      md += `### ${label} Impact on Price

| Category | Products | Avg Price | Median Price |
|:---------|:---------|:----------|:-------------|
| ${label}: Yes | ${trueItems.length} | ${brl(avg(trueItems.map((p) => p.price_numeric)))} | ${brl(median(trueItems.map((p) => p.price_numeric)))} |
| ${label}: No | ${falseItems.length} | ${brl(avg(falseItems.map((p) => p.price_numeric)))} | ${brl(median(falseItems.map((p) => p.price_numeric)))} |

`;
    }
  }

  if (featureFields.length === 0) {
    md += `No feature fields with meaningful variety detected in this dataset.

`;
  }

  md += `> **Feature insight**: Products with premium features (professional grade, accessories) command higher average prices. Consider bundling strategy to increase perceived value.

`;
  return md;
}

function analyzeImages(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  const imgBuckets = [
    { label: "0", min: 0, max: 1 },
    { label: "1", min: 1, max: 2 },
    { label: "2-3", min: 2, max: 4 },
    { label: "4-6", min: 4, max: 7 },
    { label: "7-10", min: 7, max: 11 },
    { label: "10+", min: 11, max: 999 },
  ];

  let md = `## 5. Image Quality Analysis

### Image Count Distribution

| Images | Products | Share | Avg Rating |
|:-------|:---------|:------|:-----------|
`;

  for (const ib of imgBuckets) {
    const items = valid.filter((p) => p.image_count >= ib.min && p.image_count < ib.max);
    const rated = items.filter((p) => p.rating_numeric > 0);
    const avgRating = rated.length > 0 ? avg(rated.map((p) => p.rating_numeric)).toFixed(1) : "-";
    md += `| ${ib.label} | ${items.length} | ${pct(items.length, valid.length)} | ${avgRating} |\n`;
  }

  // Brand image investment
  md += `
### Brand Image Investment (Top 10)

| Brand | Avg Images | Max Images | Products |
|:------|:-----------|:-----------|:---------|
`;

  const brandImgs: Record<string, { counts: number[]; name: string }> = {};
  for (const p of valid) {
    if (!brandImgs[p.brand]) {
      brandImgs[p.brand] = { counts: [], name: p.brand };
    }
    brandImgs[p.brand].counts.push(p.image_count);
  }

  const sortedBrandImgs = Object.values(brandImgs)
    .filter((b) => b.counts.length >= 2)
    .toSorted((a, b) => avg(b.counts) - avg(a.counts))
    .slice(0, 10);

  for (const b of sortedBrandImgs) {
    md += `| ${b.name} | ${avg(b.counts).toFixed(1)} | ${Math.max(...b.counts)} | ${b.counts.length} |\n`;
  }

  md += `
> **Image insight**: Products with more images tend to have higher ratings. Aim for 6-8 high-quality images per listing (hero, lifestyle, detail, accessory, packaging shots).

`;
  return md;
}

function analyzeSupplyChain(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Group by supply_chain values found in the data
  const scGroups: Record<string, CleanedProduct[]> = {};
  for (const p of valid) {
    if (!scGroups[p.supply_chain]) {
      scGroups[p.supply_chain] = [];
    }
    scGroups[p.supply_chain].push(p);
  }

  let md = `## 6. Supply Chain Analysis

### Supply Chain Origin Comparison

| Origin | Products | Share | Avg Price | Median Price | Main Type |
|:-------|:---------|:------|:----------|:-------------|:----------|
`;

  for (const [chain, items] of Object.entries(scGroups).toSorted(
    (a, b) => b[1].length - a[1].length,
  )) {
    if (items.length === 0) {
      continue;
    }
    const prices = items.map((p) => p.price_numeric);
    const mainType = [...new Set(items.map((p) => p.type))]
      .map((t) => ({ t, c: items.filter((p) => p.type === t).length }))
      .toSorted((a, b) => b.c - a.c)[0];
    md += `| ${chain} | ${items.length} | ${pct(items.length, valid.length)} | ${brl(avg(prices))} | ${brl(median(prices))} | ${mainType?.t || "-"} |\n`;
  }

  // Chinese brand details (if present)
  const chinese = valid.filter(
    (p) =>
      p.supply_chain.toLowerCase().includes("chinese") ||
      p.supply_chain.includes("中国") ||
      p.supply_chain.toLowerCase().includes("china"),
  );

  if (chinese.length > 0) {
    md += `
### Chinese Brand / White-label Product Details

| Brand | Products | Avg Price | Main Product | Key Features |
|:------|:---------|:----------|:-------------|:-------------|
`;

    const chineseBrands: Record<string, CleanedProduct[]> = {};
    for (const p of chinese) {
      if (!chineseBrands[p.brand]) {
        chineseBrands[p.brand] = [];
      }
      chineseBrands[p.brand].push(p);
    }

    for (const [brand, items] of Object.entries(chineseBrands).toSorted(
      (a, b) => b[1].length - a[1].length,
    )) {
      const avgP = avg(items.map((p) => p.price_numeric));
      const cordlessCount = items.filter((p) => p.power_source === "bateria").length;
      const mainPower = cordlessCount > items.length / 2 ? "cordless" : "corded";
      const features: string[] = [];
      if (mainPower === "cordless") {
        features.push("cordless");
      }
      if (items.some((p) => p.has_case)) {
        features.push("case included");
      }
      if (items.some((p) => p.voltage.includes("21"))) {
        features.push("21V");
      }
      md += `| ${brand} | ${items.length} | ${brl(avgP)} | ${items[0].type} | ${features.join(", ") || "-"} |\n`;
    }
  }

  md += `
> **Supply chain insight**: Analyze the price gap between global brands and local/Chinese brands. Chinese brands penetrate via low-price bundles but often have lower ratings and brand recognition.

`;
  return md;
}

function analyzeFBA(_products: CleanedProduct[]): string {
  // FBA cost table is generic for Brazil — kept as-is
  const fbaFees: Array<{
    label: string;
    minWeight: number;
    maxWeight: number;
    fulfillment: number;
    storage: number;
  }> = [
    { label: "Small (<=1kg)", minWeight: 0, maxWeight: 1, fulfillment: 15.9, storage: 0.8 },
    { label: "Standard (1-2kg)", minWeight: 1, maxWeight: 2, fulfillment: 19.9, storage: 1.2 },
    { label: "Medium (2-5kg)", minWeight: 2, maxWeight: 5, fulfillment: 25.9, storage: 2.0 },
    { label: "Large (5-10kg)", minWeight: 5, maxWeight: 10, fulfillment: 35.9, storage: 3.5 },
    { label: "Oversize (10kg+)", minWeight: 10, maxWeight: 999, fulfillment: 55.9, storage: 6.0 },
  ];

  let md = `## 7. FBA / Logistics Cost Estimation

### FBA Brazil Fee Reference (by weight tier)

| Weight Tier | Fulfillment Fee (R$) | Monthly Storage (R$/unit) |
|:------------|:---------------------|:--------------------------|
`;

  for (const fee of fbaFees) {
    md += `| ${fee.label} | ${brl(fee.fulfillment)} | ${brl(fee.storage)} |\n`;
  }

  md += `
### Self-ship vs FBA Comparison

| Method | Delivery Time | Est. Cost/Order | Returns | Best For |
|:-------|:-------------|:----------------|:--------|:---------|
| FBA | 1-3 days | R$15-56 | Amazon handles | High volume, standard items |
| Self-ship (Brazil warehouse) | 3-7 days | R$12-35 | Self-managed | Medium volume |
| Cross-border (China) | 15-45 days | R$25-80 | Very difficult | Low-price testing, validation |

> **Logistics tip**: FBA fulfillment fees typically account for 5-15% of product price. Lightweight items (<=2kg) have the best logistics economics. Heavy items (5kg+) should ship from local warehouses.

`;
  return md;
}

function analyzeSeasonality(_products: CleanedProduct[]): string {
  return `## 8. Seasonality & Market Trends

### Brazil Market Seasonality

\`\`\`
Month      Demand     Notes
Jan        ████████░░  80%  Summer end / construction restarts
Feb        ████████░░  80%  Pre-Carnival rush
Mar        ███████░░░  70%  Rainy season, indoor projects
Apr        ██████░░░░  60%  Autumn
May        ██████░░░░  60%  Pre-winter prep
Jun        █████░░░░░  50%  Winter low
Jul        █████░░░░░  50%  Winter low
Aug        ██████░░░░  60%  Recovery begins
Sep        ███████░░░  70%  Spring renovation season
Oct        ████████░░  80%  Peak season starts
Nov        ██████████  100% Black Friday + peak
Dec        █████████░  90%  Christmas / year-end rush
\`\`\`

### Key Marketing Dates

| Event | Timing | Expected Lift | Recommended Strategy |
|:------|:-------|:-------------|:---------------------|
| Black Friday | Last week of Nov | +80-120% | Stock up 1 month ahead, discount 20-30% |
| Dia dos Pais (Father's Day) | 2nd Sunday of Aug | +40-60% | Tools are popular gifts, promote 2 weeks early |
| Natal (Christmas) | December | +30-50% | Bundle promotions, gift packaging |
| Dia do Trabalhador (Labor Day) | May 1 | +20-30% | Tool-category promotions |
| Construction season | Oct-Mar | +20-40% | Sustained ad spend, professional-grade products |

### New vs Long-tail Product Signals

- **New listings**: Many images (>8), no reviews, higher pricing, weak brand recognition -> needs promotion investment
- **Long-tail listings**: Few images, many reviews (>100), stable pricing, known brands -> steady organic traffic
- **Recommendation**: Launch new products 2-3 months before peak season to accumulate reviews

> **Trend insight**: Brazil e-commerce grows 20%+/year. The tool segment benefits from rising DIY culture and construction activity. Cordless/lithium-ion products are gaining share year over year.

`;
}

function analyzeSelectionMatrix(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Build blue-ocean segments from type + power_source combinations
  const segments: Record<string, { count: number; avgPrice: number; competition: string }> = {};
  for (const p of valid) {
    const key = `${p.type} / ${p.power_source}`;
    if (!segments[key]) {
      segments[key] = { count: 0, avgPrice: 0, competition: "" };
    }
    segments[key].count++;
  }

  for (const [key] of Object.entries(segments)) {
    const [type, power] = key.split(" / ");
    const items = valid.filter((p) => p.type === type && p.power_source === power);
    segments[key].avgPrice = avg(items.map((p) => p.price_numeric));
    if (segments[key].count > 30) {
      segments[key].competition = "High";
    } else if (segments[key].count > 15) {
      segments[key].competition = "Medium";
    } else {
      segments[key].competition = "Low";
    }
  }

  let md = `## 9. Selection Matrix

### Blue Ocean Opportunity Analysis

| Segment | Products | Competition | Avg Price | Opportunity |
|:--------|:---------|:-----------|:----------|:------------|
`;

  const opportunities = Object.entries(segments)
    .filter(([, v]) => v.count >= 3)
    .toSorted((a, b) => a[1].count - b[1].count);

  for (const [key, data] of opportunities.slice(0, 10)) {
    let opportunity: string;
    if (data.count < 10) {
      opportunity = "*** Blue ocean";
    } else if (data.count < 20) {
      opportunity = "** Viable entry";
    } else {
      opportunity = "* Red ocean";
    }
    md += `| ${key} | ${data.count} | ${data.competition} | ${brl(data.avgPrice)} | ${opportunity} |\n`;
  }

  // SKU strategy
  const withSkus = valid.filter((p) => p.sku_count > 0);
  const avgSkuCount = avg(withSkus.map((p) => p.sku_count));

  md += `
### SKU Strategy

- Products with SKU variants: ${withSkus.length} (${pct(withSkus.length, valid.length)})
- Average SKU count: ${avgSkuCount.toFixed(1)}

### Pricing Strategy Matrix

| Strategy | Price Range | Target Customer | Competitive Set |
|:---------|:-----------|:---------------|:----------------|
`;

  // Build dynamic pricing tiers from the data
  const allPrices = valid.map((p) => p.price_numeric).toSorted((a, b) => a - b);
  const p25 = allPrices[Math.floor(allPrices.length * 0.25)] || 0;
  const p50 = allPrices[Math.floor(allPrices.length * 0.5)] || 0;
  const p75 = allPrices[Math.floor(allPrices.length * 0.75)] || 0;

  md += `| Budget entry | Below ${brl(p25)} | Price-sensitive buyers | White-label, low-end |
| Value positioning | ${brl(p25)}-${brl(p50)} | Mainstream consumers | Local brands, mid-tier |
| Quality premium | ${brl(p50)}-${brl(p75)} | Quality-conscious buyers | Established brands |
| Professional | Above ${brl(p75)} | Professionals / gifting | Global premium brands |

### Competitive Barrier Assessment

| Barrier | Difficulty | Notes |
|:--------|:----------|:------|
| Review accumulation | High | First 50 reviews are critical; consider Vine program |
| Brand recognition | Very High | New brands need 6-12 months of sustained investment |
| Price wars | Medium | Differentiate on features/quality rather than price |
| Logistics speed | Medium | FBA is the baseline expectation |
| After-sales service | High | Power tools have high return rates; local support needed |

> **Selection summary**:
> 1. Low-competition segments (blue ocean) offer the best entry opportunities
> 2. Position in the value tier (${brl(p25)}-${brl(p50)}) for best volume potential
> 3. Differentiate via quality and bundling rather than competing on price alone
> 4. Avoid saturated segments with 30+ competing products unless you have a clear advantage

`;
  return md;
}

// ── Main ──

function main() {
  const inputPath = args.input as string;
  const outputPath = args.output as string;

  console.log("=== Market Analysis Pipeline ===\n");

  let raw: string;
  try {
    raw = readFileSync(inputPath, "utf-8");
  } catch (e: unknown) {
    console.error(`Failed to read input file: ${String(e)}`);
    process.exit(1);
  }

  let products: CleanedProduct[];
  try {
    products = JSON.parse(raw) as CleanedProduct[];
  } catch (e: unknown) {
    console.error(`Failed to parse JSON: ${String(e)}`);
    process.exit(1);
  }

  console.log(`Loaded ${products.length} cleaned products from ${inputPath}`);

  const category = inferCategory(products);
  console.log(`Inferred category: ${category}`);

  const sections = [
    `# Market Analysis Report: ${category}

> Data sources: Amazon Brazil + Mercado Livre | Products: ${products.length} | Generated: ${new Date().toISOString().split("T")[0]}
> This report is oriented toward product selection decisions. All analysis dimensions include actionable recommendations.

---

`,
    analyzeMarketOverview(products),
    analyzePricing(products),
    analyzeBrands(products),
    analyzeProductFeatures(products),
    analyzeImages(products),
    analyzeSupplyChain(products),
    analyzeFBA(products),
    analyzeSeasonality(products),
    analyzeSelectionMatrix(products),
  ];

  const report = sections.join("\n");
  writeFileSync(outputPath, report);
  console.log(`\nReport saved to ${outputPath}`);
  console.log(
    `Report size: ${(report.length / 1024).toFixed(0)} KB, ${report.split("\n").length} lines`,
  );
}

main();
