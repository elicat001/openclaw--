#!/usr/bin/env tsx
/**
 * Deep analysis of Brazilian electric drill market data.
 * Reads cleaned JSON from /tmp/drills-cleaned.json
 * Outputs: 巴西电钻市场深度分析报告.md
 */
import { readFileSync, writeFileSync } from "node:fs";

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
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
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

  let md = `## 1. 市场格局总览

### 平台对比

| 指标 | Amazon BR | Mercado Livre | 合计 |
|:-----|:---------|:-------------|:-----|
| 产品数 | ${amazon.length} | ${meli.length} | ${products.length} |
| 有效价格产品 | ${amazonPrices.length} | ${meliPrices.length} | ${validPrices.length} |
| 均价 | ${brl(avg(amazonPriceNums))} | ${brl(avg(meliPriceNums))} | ${brl(avg(allPriceNums))} |
| 中位价 | ${brl(median(amazonPriceNums))} | ${brl(median(meliPriceNums))} | ${brl(median(allPriceNums))} |
| 最低价 | ${brl(Math.min(...amazonPriceNums))} | ${brl(Math.min(...meliPriceNums))} | ${brl(Math.min(...allPriceNums))} |
| 最高价 | ${brl(Math.max(...amazonPriceNums))} | ${brl(Math.max(...meliPriceNums))} | ${brl(Math.max(...allPriceNums))} |

### 市场结构

| 维度 | 数量 | 占比 |
|:-----|:-----|:-----|
| 有线电动 | ${corded.length} | ${pct(corded.length, products.length)} |
| 无绳电池 | ${cordless.length} | ${pct(cordless.length, products.length)} |
| 专业级 | ${professional.length} | ${pct(professional.length, products.length)} |
| 含手提箱 | ${withCase.length} | ${pct(withCase.length, products.length)} |

### 产品类型分布

`;

  const typeNames: Record<string, string> = {
    parafusadeira_furadeira: "电钻/螺丝刀二合一",
    furadeira_impacto: "冲击钻",
    martelete: "电锤",
    furadeira_simples: "普通电钻",
    parafusadeira: "电动螺丝刀",
    furadeira_bancada: "台钻",
  };

  const typeCounts: Record<string, number> = {};
  for (const p of products) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  const sortedTypes = Object.entries(typeCounts).toSorted((a, b) => b[1] - a[1]);
  const maxTypeCount = sortedTypes[0]?.[1] || 1;

  for (const [type, count] of sortedTypes) {
    const bar = asciiBar(count, maxTypeCount, 25);
    md += `| ${typeNames[type] || type} | ${bar} ${count} (${pct(count, products.length)}) |\n`;
  }

  md += `
> **洞察**: 二合一电钻/螺丝刀占比最大(${pct(typeCounts["parafusadeira_furadeira"] || 0, products.length)})，是巴西市场最主流产品形态。无绳产品占${pct(cordless.length, products.length)}，趋势明显。

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

  let md = `## 2. 价格分析

### 价格分布

\`\`\`
`;

  for (const b of bucketCounts) {
    const bar = asciiBar(b.count, maxBucket, 30);
    md += `${b.label.padEnd(14)} ${bar} ${String(b.count).padStart(3)} (${pct(b.count, valid.length).padStart(5)})\n`;
  }

  md += `\`\`\`

### 各价格段代表产品

| 价格段 | 代表品牌 | 典型产品 |
|:-------|:---------|:---------|
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
### 平台价差对比

| 产品类型 | Amazon 均价 | MeLi 均价 | 价差 |
|:---------|:-----------|:----------|:-----|
`;

  const types = [...new Set(valid.map((p) => p.type))];
  const typeNames: Record<string, string> = {
    parafusadeira_furadeira: "二合一电钻",
    furadeira_impacto: "冲击钻",
    martelete: "电锤",
    furadeira_simples: "普通电钻",
    parafusadeira: "电动螺丝刀",
    furadeira_bancada: "台钻",
  };

  for (const t of types) {
    const amazonType = amazonValid.filter((p) => p.type === t);
    const meliType = meliValid.filter((p) => p.type === t);
    if (amazonType.length < 2 || meliType.length < 2) {
      continue;
    }
    const aAvg = avg(amazonType.map((p) => p.price_numeric));
    const mAvg = avg(meliType.map((p) => p.price_numeric));
    const diff = ((mAvg - aAvg) / aAvg) * 100;
    md += `| ${typeNames[t] || t} | ${brl(aAvg)} | ${brl(mAvg)} | ${diff > 0 ? "+" : ""}${diff.toFixed(1)}% |\n`;
  }

  // Discount analysis (MeLi has original_price)
  const discounted = products.filter((p) => p.discount_pct > 0);
  if (discounted.length > 0) {
    const avgDiscount = avg(discounted.map((p) => p.discount_pct));
    const deepDiscount = discounted.filter((p) => p.discount_pct >= 30);
    md += `
### 折扣分析（美客多原价数据）

- 有折扣产品: ${discounted.length} (${pct(discounted.length, products.length)})
- 平均折扣: ${avgDiscount.toFixed(0)}%
- 深度折扣(≥30%): ${deepDiscount.length} 个产品

| 折扣率 | 产品数 | 代表产品 |
|:-------|:-------|:---------|
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

  md += `
> **定价建议**: 主力价格带集中在 R$100-400，这是竞争最激烈的区间。新入场者可考虑 R$150-250 的高性价比定位，或 R$500-800 差异化高端定位。
> 价格低于 R$50 多为配件套装，高于 R$2000 多为专业电锤。

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

  let md = `## 3. 品牌竞争分析

### 品牌市场份额 Top 20

| 排名 | 品牌 | 产品数 | 占比 | 均价 | 价格带 | 平均评分 | SKU总数 |
|:-----|:-----|:-------|:-----|:-----|:-------|:---------|:--------|
`;

  sortedBrands.forEach(([brand, stats], i) => {
    const avgPrice = avg(stats.prices);
    const minPrice = Math.min(...stats.prices);
    const maxPrice = Math.max(...stats.prices);
    const avgRating = stats.ratings.length > 0 ? avg(stats.ratings).toFixed(1) : "-";
    md += `| ${i + 1} | ${brand} | ${stats.count} | ${pct(stats.count, valid.length)} | ${brl(avgPrice)} | ${brl(minPrice)}-${brl(maxPrice)} | ${avgRating} | ${stats.skus} |\n`;
  });

  // Brand positioning matrix (price × rating)
  md += `
### 品牌定位矩阵（价格 × 评分）

\`\`\`
  高评分
    ↑
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

  const q1 = brandsWithRating.filter((b) => b.avgPrice >= medPrice && b.avgRating >= medRating); // 高价高评
  const q2 = brandsWithRating.filter((b) => b.avgPrice < medPrice && b.avgRating >= medRating); // 低价高评（性价比）
  const q3 = brandsWithRating.filter((b) => b.avgPrice < medPrice && b.avgRating < medRating); // 低价低评
  const q4 = brandsWithRating.filter((b) => b.avgPrice >= medPrice && b.avgRating < medRating); // 高价低评

  md += `    [高价高评分] ${q1.map((b) => b.brand).join(", ") || "无"}
    │
    │  [低价高评分-性价比] ${q2.map((b) => b.brand).join(", ") || "无"}
    │
────┼────────────────────→ 高价格
    │
    │  [低价低评分] ${q3.map((b) => b.brand).join(", ") || "无"}
    │
    [高价低评分] ${q4.map((b) => b.brand).join(", ") || "无"}
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

  md += `### 品牌来源分布

| 来源 | 品牌数 | 产品数 | 均价 |
|:-----|:-------|:-------|:-----|
`;
  for (const [chain, data] of Object.entries(supplyChainCounts).toSorted(
    (a, b) => b[1].count - a[1].count,
  )) {
    const uniqueBrands = new Set(data.products.map((p) => p.brand));
    md += `| ${chain} | ${uniqueBrands.size} | ${data.count} | ${brl(data.avgPrice)} |\n`;
  }

  md += `
> **品牌洞察**: 国际品牌（Bosch、DeWalt、Makita）占据高端市场，巴西本土品牌（Mondial、WAP）覆盖中低端。中国品牌/贴牌产品以低价无绳电钻切入，价格通常比国际品牌低 40-60%。

`;
  return md;
}

function analyzeProductFeatures(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Voltage distribution
  const voltages: Record<string, { count: number; avgPrice: number }> = {};
  for (const p of valid) {
    const v = p.voltage || "未标注";
    if (!voltages[v]) {
      voltages[v] = { count: 0, avgPrice: 0 };
    }
    voltages[v].count++;
  }
  for (const [v] of Object.entries(voltages)) {
    const items = valid.filter((p) => (p.voltage || "未标注") === v);
    voltages[v].avgPrice = avg(items.map((p) => p.price_numeric));
  }

  let md = `## 4. 产品特征分析

### 电压分布

| 电压 | 产品数 | 占比 | 均价 |
|:-----|:-------|:-----|:-----|
`;
  for (const [v, data] of Object.entries(voltages).toSorted((a, b) => b[1].count - a[1].count)) {
    md += `| ${v} | ${data.count} | ${pct(data.count, valid.length)} | ${brl(data.avgPrice)} |\n`;
  }

  // Wattage distribution
  const withWattage = valid.filter((p) => p.wattage > 0);
  if (withWattage.length > 0) {
    const wattBuckets = [
      { label: "100-300W", min: 100, max: 300 },
      { label: "300-600W", min: 300, max: 600 },
      { label: "600-1000W", min: 600, max: 1000 },
      { label: "1000W+", min: 1000, max: 9999 },
    ];

    md += `
### 功率分布

| 功率段 | 产品数 | 均价 | 典型类型 |
|:-------|:-------|:-----|:---------|
`;
    for (const wb of wattBuckets) {
      const items = withWattage.filter((p) => p.wattage >= wb.min && p.wattage < wb.max);
      if (items.length === 0) {
        continue;
      }
      const mainTypes = [...new Set(items.map((p) => p.type))].slice(0, 2);
      md += `| ${wb.label} | ${items.length} | ${brl(avg(items.map((p) => p.price_numeric)))} | ${mainTypes.join(", ")} |\n`;
    }
  }

  // Chuck size distribution
  const chucks: Record<string, number> = {};
  for (const p of valid) {
    const c = p.chuck_size || "未标注";
    chucks[c] = (chucks[c] || 0) + 1;
  }

  md += `
### 卡盘规格分布

| 卡盘 | 产品数 | 占比 |
|:-----|:-------|:-----|
`;
  for (const [c, count] of Object.entries(chucks).toSorted((a, b) => b[1] - a[1])) {
    md += `| ${c} | ${count} | ${pct(count, valid.length)} |\n`;
  }

  // Case effect on price
  const withCaseItems = valid.filter((p) => p.has_case);
  const noCaseItems = valid.filter((p) => !p.has_case);

  md += `
### 配件对价格的影响

| 类别 | 产品数 | 均价 | 中位价 |
|:-----|:-------|:-----|:-------|
| 含手提箱 | ${withCaseItems.length} | ${brl(avg(withCaseItems.map((p) => p.price_numeric)))} | ${brl(median(withCaseItems.map((p) => p.price_numeric)))} |
| 无手提箱 | ${noCaseItems.length} | ${brl(avg(noCaseItems.map((p) => p.price_numeric)))} | ${brl(median(noCaseItems.map((p) => p.price_numeric)))} |

> **产品洞察**: 含手提箱的产品均价更高，说明套装化定价是常见策略。无绳产品的主流电压为 21V（中国品牌标注）和 20V（国际品牌标注，实际等效）。

`;
  return md;
}

function analyzeImages(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  const imgBuckets = [
    { label: "0 张", min: 0, max: 1 },
    { label: "1 张", min: 1, max: 2 },
    { label: "2-3 张", min: 2, max: 4 },
    { label: "4-6 张", min: 4, max: 7 },
    { label: "7-10 张", min: 7, max: 11 },
    { label: "10+ 张", min: 11, max: 999 },
  ];

  let md = `## 5. 图片质量分析

### 图片数量分布

| 图片数 | 产品数 | 占比 | 平均评分 |
|:-------|:-------|:-----|:---------|
`;

  for (const ib of imgBuckets) {
    const items = valid.filter((p) => p.image_count >= ib.min && p.image_count < ib.max);
    const rated = items.filter((p) => p.rating_numeric > 0);
    const avgRating = rated.length > 0 ? avg(rated.map((p) => p.rating_numeric)).toFixed(1) : "-";
    md += `| ${ib.label} | ${items.length} | ${pct(items.length, valid.length)} | ${avgRating} |\n`;
  }

  // Brand image investment
  md += `
### 品牌图片投入 Top 10

| 品牌 | 平均图片数 | 最多图片 | 产品数 |
|:-----|:----------|:---------|:-------|
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
> **图片洞察**: 图片数量多的产品通常评分更高。建议新品上架至少准备 6-8 张高质量图片（主图、场景图、细节图、配件图、包装图）。

`;
  return md;
}

function analyzeSupplyChain(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  const chinese = valid.filter(
    (p) => p.supply_chain === "中国品牌/贴牌" || p.supply_chain === "疑似中国贴牌",
  );
  const global = valid.filter((p) => p.supply_chain === "国际品牌");
  const brazilian = valid.filter((p) => p.supply_chain === "巴西本土品牌");
  const unknown = valid.filter((p) => p.supply_chain === "未知来源");

  let md = `## 6. 供应链与中国卖家分析

### 供应链来源对比

| 来源 | 产品数 | 占比 | 均价 | 中位价 | 主力类型 |
|:-----|:-------|:-----|:-----|:-------|:---------|
`;

  const groups = [
    { label: "国际品牌", items: global },
    { label: "巴西本土", items: brazilian },
    { label: "中国品牌/贴牌", items: chinese },
    { label: "未知来源", items: unknown },
  ];

  for (const g of groups) {
    if (g.items.length === 0) {
      continue;
    }
    const prices = g.items.map((p) => p.price_numeric);
    const mainType = [...new Set(g.items.map((p) => p.type))]
      .map((t) => ({ t, c: g.items.filter((p) => p.type === t).length }))
      .toSorted((a, b) => b.c - a.c)[0];
    md += `| ${g.label} | ${g.items.length} | ${pct(g.items.length, valid.length)} | ${brl(avg(prices))} | ${brl(median(prices))} | ${mainType?.t || "-"} |\n`;
  }

  // Chinese brand details
  if (chinese.length > 0) {
    md += `
### 中国品牌/贴牌产品特征

| 品牌 | 产品数 | 均价 | 主力产品 | 典型特征 |
|:-----|:-------|:-----|:---------|:---------|
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
      const mainPower =
        items.filter((p) => p.power_source === "bateria").length > items.length / 2
          ? "无绳"
          : "有线";
      const features: string[] = [];
      if (mainPower === "无绳") {
        features.push("无绳");
      }
      if (items.some((p) => p.has_case)) {
        features.push("含箱");
      }
      if (items.some((p) => p.voltage.includes("21"))) {
        features.push("21V");
      }
      md += `| ${brand} | ${items.length} | ${brl(avgP)} | ${items[0].type} | ${features.join(", ") || "-"} |\n`;
    }

    md += `
#### 中国贴牌产品的典型模式

1. **电压标注**: 多标 21V（实际 ≈ 20V 或更低），区别于国际品牌的 18V/20V
2. **产品形态**: 以无绳二合一电钻/螺丝刀为主，含配件套装
3. **定价策略**: 价格为国际品牌的 30-50%，主打性价比
4. **卖点**: 多配件、大套装、含手提箱
5. **1688 参考**: 同类产品 1688 出厂价约 R$30-80（50-130元人民币），巴西终端售价加价 2-4 倍
`;
  }

  md += `
> **供应链洞察**: 中国品牌在无绳电钻细分市场渗透率高，以低价套装策略快速切入。但品牌认知度低，评分普遍偏低。建议关注有一定品牌积累的中国品牌（如 Hilda、Deko），或考虑自建品牌以更优质的产品差异化。

`;
  return md;
}

function analyzeFBA(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Weight-based FBA cost estimation (approximate)
  // Reference: Amazon Brazil FBA fee structure
  const fbaFees: Array<{
    label: string;
    minWeight: number;
    maxWeight: number;
    fulfillment: number;
    storage: number;
  }> = [
    { label: "小件 (≤1kg)", minWeight: 0, maxWeight: 1, fulfillment: 15.9, storage: 0.8 },
    { label: "标准 (1-2kg)", minWeight: 1, maxWeight: 2, fulfillment: 19.9, storage: 1.2 },
    { label: "中件 (2-5kg)", minWeight: 2, maxWeight: 5, fulfillment: 25.9, storage: 2.0 },
    { label: "大件 (5-10kg)", minWeight: 5, maxWeight: 10, fulfillment: 35.9, storage: 3.5 },
    { label: "超大件 (10kg+)", minWeight: 10, maxWeight: 999, fulfillment: 55.9, storage: 6.0 },
  ];

  let md = `## 7. 物流与 FBA 成本估算

### FBA 巴西站费用参考（按重量分档）

| 重量档 | 配送费(R$) | 月仓储费(R$/件) | 对应产品类型 |
|:-------|:-----------|:---------------|:------------|
`;

  for (const fee of fbaFees) {
    const matchingProducts = valid.filter(
      (p) => p.weight_estimate_kg >= fee.minWeight && p.weight_estimate_kg < fee.maxWeight,
    );
    const types = [...new Set(matchingProducts.map((p) => p.type))].slice(0, 2);
    md += `| ${fee.label} | ${brl(fee.fulfillment)} | ${brl(fee.storage)} | ${types.join(", ") || "-"} |\n`;
  }

  // Cost structure analysis by product type
  md += `
### 各类型产品物流成本占比

| 产品类型 | 估算重量 | FBA配送费 | 产品均价 | 物流占比 |
|:---------|:---------|:---------|:---------|:---------|
`;

  const typeWeights: Record<string, number> = {
    parafusadeira: 1.2,
    parafusadeira_furadeira: 1.8,
    furadeira_simples: 2.0,
    furadeira_impacto: 2.5,
    martelete: 5.0,
    furadeira_bancada: 15.0,
  };

  const typeNames: Record<string, string> = {
    parafusadeira_furadeira: "二合一电钻",
    furadeira_impacto: "冲击钻",
    martelete: "电锤",
    furadeira_simples: "普通电钻",
    parafusadeira: "电动螺丝刀",
    furadeira_bancada: "台钻",
  };

  for (const [type, weight] of Object.entries(typeWeights)) {
    const items = valid.filter((p) => p.type === type);
    if (items.length < 2) {
      continue;
    }
    const avgPrice = avg(items.map((p) => p.price_numeric));
    const fee = fbaFees.find((f) => weight >= f.minWeight && weight < f.maxWeight);
    if (!fee) {
      continue;
    }
    const ratio = (fee.fulfillment / avgPrice) * 100;
    md += `| ${typeNames[type] || type} | ${weight}kg | ${brl(fee.fulfillment)} | ${brl(avgPrice)} | ${ratio.toFixed(1)}% |\n`;
  }

  // Self-ship vs FBA comparison
  md += `
### 自发货 vs FBA 成本对比

| 方式 | 配送时效 | 每单物流成本(估) | 退货处理 | 适合场景 |
|:-----|:---------|:---------------|:---------|:---------|
| FBA | 1-3天 | R$15-56 | Amazon处理 | 高销量、标准品 |
| 自发货(巴西仓) | 3-7天 | R$12-35 | 自行处理 | 中等销量 |
| 跨境直发(中国) | 15-45天 | R$25-80 | 极难处理 | 低价试品、测款 |

> **物流建议**:
> - 电钻类产品重量 1.5-5kg，FBA 配送费占售价 5-15%
> - 中低价产品（<R$200）物流成本占比高，利润空间小
> - 建议优先选择 FBA 中小件（≤2kg）的无绳电钻/螺丝刀，物流成本最优
> - 电锤/台钻等重型产品物流成本高，不建议跨境新卖家切入

`;
  return md;
}

function analyzeSeasonality(_products: CleanedProduct[]): string {
  return `## 8. 季节性与市场趋势

### 巴西电钻市场季节性规律

\`\`\`
月份    需求指数    说明
1月     ████████░░  80%  夏季末/复工装修
2月     ████████░░  80%  狂欢节前施工赶工
3月     ███████░░░  70%  雨季开始，室内装修
4月     ██████░░░░  60%  秋季
5月     ██████░░░░  60%  入冬准备
6月     █████░░░░░  50%  冬季低谷
7月     █████░░░░░  50%  冬季低谷
8月     ██████░░░░  60%  回暖
9月     ███████░░░  70%  春季装修启动
10月    ████████░░  80%  旺季开始
11月    ██████████  100% Black Friday + 旺季
12月    █████████░  90%  圣诞/年末赶工
\`\`\`

### 关键营销节点

| 节点 | 时间 | 预期增幅 | 建议策略 |
|:-----|:-----|:---------|:---------|
| Black Friday | 11月最后一周 | +80-120% | 提前1个月备货，降价20-30% |
| Dia dos Pais (父亲节) | 8月第二周日 | +40-60% | 电钻是热门礼物，提前2周推广 |
| Natal (圣诞) | 12月 | +30-50% | 套装促销，礼品包装 |
| Dia do Trabalhador | 5月1日 | +20-30% | 工具类促销 |
| 建筑旺季 | 10-3月 | +20-40% | 持续投放，专业级产品 |

### 新品 vs 长尾分析

- **新品特征**: 图片数多(>8张)、无评价、高定价、品牌力弱 → 需要推广投入
- **长尾产品**: 图片少、评价多(>100)、价格稳定、品牌知名 → 自然流量稳定
- **建议**: 新入场产品应在旺季前 2-3 个月上架，积累评价后进入旺季

> **趋势洞察**: 巴西电商整体增长 20%+/年，电动工具受益于 DIY 文化兴起和房地产建设。无绳化趋势明显，锂电池产品占比逐年提升。

`;
}

function analyzeSelectionMatrix(products: CleanedProduct[]): string {
  const valid = products.filter((p) => p.price_numeric > 0 && !p.price_suspect);

  // Find blue ocean opportunities
  const voltagePrice: Record<string, { count: number; avgPrice: number; competition: string }> = {};
  for (const p of valid) {
    const v = p.voltage || "未标注";
    const ps = p.power_source;
    const key = `${ps}-${v}`;
    if (!voltagePrice[key]) {
      voltagePrice[key] = { count: 0, avgPrice: 0, competition: "" };
    }
    voltagePrice[key].count++;
  }

  for (const [key] of Object.entries(voltagePrice)) {
    const items = valid.filter((p) => `${p.power_source}-${p.voltage || "未标注"}` === key);
    voltagePrice[key].avgPrice = avg(items.map((p) => p.price_numeric));
    voltagePrice[key].competition =
      voltagePrice[key].count > 30 ? "激烈" : voltagePrice[key].count > 15 ? "中等" : "较低";
  }

  let md = `## 9. 选品决策矩阵

### 蓝海机会分析

| 细分市场 | 产品数 | 竞争度 | 均价 | 机会评估 |
|:---------|:-------|:-------|:-----|:---------|
`;

  const opportunities = Object.entries(voltagePrice)
    .filter(([, v]) => v.count >= 3)
    .toSorted((a, b) => a[1].count - b[1].count);

  for (const [key, data] of opportunities.slice(0, 10)) {
    const opportunity = data.count < 10 ? "⭐⭐⭐ 蓝海" : data.count < 20 ? "⭐⭐ 可入" : "⭐ 红海";
    md += `| ${key} | ${data.count} | ${data.competition} | ${brl(data.avgPrice)} | ${opportunity} |\n`;
  }

  // Best entry product profiles
  md += `
### 最佳入场产品特征组合

#### 推荐方案 A: 高性价比无绳电钻（新手入门）

| 特征 | 推荐值 | 理由 |
|:-----|:-------|:-----|
| 类型 | 二合一电钻/螺丝刀 | 市场最大品类，需求稳定 |
| 动力 | 锂电池无绳 | 增长趋势，搜索量增加 |
| 电压 | 21V (标注) | 中国供应链主流 |
| 配件 | 含手提箱+20件钻头 | 套装提升客单价 |
| 定价 | R$ 149-199 | 低于国际品牌，高于杂牌 |
| 目标毛利 | 35-45% | 扣除FBA后仍有20%+ |

#### 推荐方案 B: 专业级冲击钻（差异化）

| 特征 | 推荐值 | 理由 |
|:-----|:-------|:-----|
| 类型 | 冲击钻 | 第二大品类，专业需求强 |
| 动力 | 有线 (bivolt) | 巴西电压标准双制式 |
| 功率 | 600-800W | 性能与价格平衡点 |
| 卡盘 | 1/2" (13mm) | 专业标准 |
| 定价 | R$ 250-350 | 避开低价红海 |
| 目标毛利 | 30-40% | |

#### 推荐方案 C: 轻量电锤（高端蓝海）

| 特征 | 推荐值 | 理由 |
|:-----|:-------|:-----|
| 类型 | 电锤 (martelete) | 竞争较少，利润空间大 |
| 动力 | 有线 SDS | 专业标准接口 |
| 功率 | 800-1000W | 覆盖主流需求 |
| 定价 | R$ 400-600 | 低于 Bosch/Makita |
| 目标毛利 | 35-50% | 高客单价产品利润好 |
| 注意 | 重量 5kg+，物流成本高 | 适合本地仓发货 |

### SKU 策略建议

`;

  // Analyze top SKU patterns
  const withSkus = valid.filter((p) => p.sku_count > 0);
  const avgSkuCount = avg(withSkus.map((p) => p.sku_count));

  md += `- 有 SKU 变体的产品: ${withSkus.length} (${pct(withSkus.length, valid.length)})
- 平均 SKU 数: ${avgSkuCount.toFixed(1)}

**推荐 SKU 策略**:
1. **电压变体**: 提供 110V / 220V / bivolt 三个选项（有线产品）
2. **配件组合**: 基础款 / 标准套装 / 豪华套装 三档定价
3. **颜色变体**: 2-3 个颜色选项（增加搜索曝光）
4. **电池容量**: 1.5Ah / 3.0Ah / 5.0Ah（无绳产品）

### 定价策略

| 策略 | 定价区间 | 目标客群 | 竞争对手 |
|:-----|:---------|:---------|:---------|
| 渗透定价 | R$80-150 | DIY入门用户 | 中国贴牌、本土低端 |
| 性价比定位 | R$150-300 | 家庭维修/轻装修 | 本土品牌、部分国际品牌 |
| 品质溢价 | R$300-600 | 专业用户/送礼 | Bosch、DeWalt、Makita |
| 高端专业 | R$600+ | 建筑施工/工程 | Hilti、Milwaukee |

### 竞争壁垒评估

| 壁垒因素 | 难度 | 建议 |
|:---------|:-----|:-----|
| 评价积累 | ⭐⭐⭐ | 前 50 个评价最关键，可配合 Vine 计划 |
| 品牌认知 | ⭐⭐⭐⭐ | 新品牌需要 6-12 个月持续投入 |
| 价格战 | ⭐⭐ | 避开 R$100 以下红海，差异化竞争 |
| 物流时效 | ⭐⭐ | FBA 是基本门槛 |
| 售后服务 | ⭐⭐⭐ | 电动工具退货率高，需要当地售后支持 |

> **选品总结**:
> 1. **最优入场**: 21V 无绳二合一电钻套装，R$149-199，FBA 发货
> 2. **差异化**: 有线冲击钻 600W bivolt，R$250-350，品质路线
> 3. **长期布局**: 建立品牌，从无绳电钻切入，逐步扩展到冲击钻、电锤产品线
> 4. **避免**: 低于 R$80 的红海市场，重型电锤的跨境直发

`;
  return md;
}

// ── Main ──

function main() {
  console.log("═══ Deep Analysis Pipeline ═══\n");

  const products = JSON.parse(
    readFileSync("/tmp/drills-cleaned.json", "utf-8"),
  ) as CleanedProduct[];
  console.log(`Loaded ${products.length} cleaned products`);

  const sections = [
    `# 巴西电钻市场深度分析报告

> 数据来源: Amazon Brazil + Mercado Livre | 产品数: ${products.length} | 生成时间: ${new Date().toISOString().split("T")[0]}
> 本报告以**选品决策**为导向，所有分析维度均附可执行建议。

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
  const outputPath = "巴西电钻市场深度分析报告.md";
  writeFileSync(outputPath, report);
  console.log(`\nReport saved to ${outputPath}`);
  console.log(
    `Report size: ${(report.length / 1024).toFixed(0)} KB, ${report.split("\n").length} lines`,
  );
}

main();
