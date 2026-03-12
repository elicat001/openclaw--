#!/usr/bin/env tsx
/**
 * Data cleaning pipeline for Brazilian electric drill crawl data.
 * Reads raw JSON from /tmp, outputs cleaned + enriched JSON to /tmp/drills-cleaned.json
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

// ── Brand Database ──

const BRAND_DB: Array<{ patterns: string[]; name: string; origin: string }> = [
  // Global brands
  { patterns: ["BOSCH"], name: "Bosch", origin: "global" },
  { patterns: ["DEWALT", "DE WALT"], name: "DeWalt", origin: "global" },
  { patterns: ["MAKITA"], name: "Makita", origin: "global" },
  { patterns: ["STANLEY"], name: "Stanley", origin: "global" },
  {
    patterns: ["BLACK+DECKER", "BLACK DECKER", "BLACK&DECKER", "B&D"],
    name: "BLACK+DECKER",
    origin: "global",
  },
  { patterns: ["MILWAUKEE"], name: "Milwaukee", origin: "global" },
  { patterns: ["HILTI"], name: "Hilti", origin: "global" },
  { patterns: ["METABO"], name: "Metabo", origin: "global" },
  { patterns: ["SKIL"], name: "Skil", origin: "global" },
  { patterns: ["DREMEL"], name: "Dremel", origin: "global" },
  { patterns: ["RIDGID"], name: "Ridgid", origin: "global" },
  { patterns: ["KRESS"], name: "Kress", origin: "global" },
  // Brazilian brands
  { patterns: ["MONDIAL"], name: "Mondial", origin: "brazil" },
  { patterns: ["WAP"], name: "WAP", origin: "brazil" },
  { patterns: ["VONDER"], name: "Vonder", origin: "brazil" },
  { patterns: ["TRAMONTINA"], name: "Tramontina", origin: "brazil" },
  { patterns: ["SCHULZ"], name: "Schulz", origin: "brazil" },
  { patterns: ["PHILCO"], name: "Philco", origin: "brazil" },
  { patterns: ["WORKER"], name: "Worker", origin: "brazil" },
  { patterns: ["GAMMA"], name: "Gamma", origin: "brazil" },
  { patterns: ["FORTGPRO", "FORTG PRO", "FORTG"], name: "FortG Pro", origin: "brazil" },
  { patterns: ["HAMMER"], name: "Hammer", origin: "brazil" },
  { patterns: ["LYNUS"], name: "Lynus", origin: "brazil" },
  { patterns: ["TITAN"], name: "Titan", origin: "brazil" },
  { patterns: ["DEXTER"], name: "Dexter", origin: "brazil" },
  { patterns: ["EOS"], name: "Eos", origin: "brazil" },
  { patterns: ["MESTRI"], name: "Mestri", origin: "brazil" },
  { patterns: ["NOVE54"], name: "Nove54", origin: "brazil" },
  { patterns: ["CHARBS"], name: "Charbs", origin: "brazil" },
  // German
  { patterns: ["EINHELL"], name: "Einhell", origin: "global" },
  // Chinese brands (often white-label / OEM)
  {
    patterns: ["THE BLACK TOOLS", "BLACK TOOLS", "THEBLACKTOOLS"],
    name: "The Black Tools",
    origin: "china",
  },
  { patterns: ["HOLTTER"], name: "Holtter", origin: "china" },
  { patterns: ["SONGHE"], name: "Songhe", origin: "china" },
  { patterns: ["NKF"], name: "NKF", origin: "china" },
  { patterns: ["SPARKBR"], name: "SparkBr", origin: "china" },
  { patterns: ["HANABI"], name: "Hanabi", origin: "china" },
  { patterns: ["DEKO"], name: "Deko", origin: "china" },
  { patterns: ["HILDA"], name: "Hilda", origin: "china" },
  { patterns: ["PROSTORMER"], name: "Prostormer", origin: "china" },
  { patterns: ["KAMOLEE"], name: "Kamolee", origin: "china" },
  { patterns: ["GRADIENTE"], name: "Gradiente", origin: "brazil" },
  { patterns: ["VULCAN"], name: "Vulcan", origin: "brazil" },
];

function identifyBrand(name: string): { brand: string; origin: string } {
  const upper = name.toUpperCase();

  // 1. Exact pattern match
  for (const entry of BRAND_DB) {
    for (const pattern of entry.patterns) {
      if (upper.includes(pattern)) {
        return { brand: entry.name, origin: entry.origin };
      }
    }
  }

  // 2. First-word extraction for unknown brands
  // If name starts with a capitalized brand-like word (not a product type word)
  const productWords = new Set([
    "FURADEIRA",
    "PARAFUSADEIRA",
    "MARTELETE",
    "KIT",
    "JOGO",
    "CHAVE",
    "CONJUNTO",
    "MINI",
    "SUPER",
    "NOVA",
    "NOVO",
    "PRO",
    "BRUSHLESS",
    "ELETROPNEUMÁTICO",
    "ELETROPNEUMATICO",
  ]);
  const firstWord = name
    .split(/[\s,]+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (firstWord.length >= 3 && !productWords.has(firstWord)) {
    return { brand: name.split(/[\s,]+/)[0], origin: "unknown" };
  }

  return { brand: "Sem marca", origin: "unknown" };
}

// ── Product Classification ──

function classifyProduct(name: string): {
  type: string;
  power_source: string;
  voltage: string;
  wattage: number;
  chuck_size: string;
  is_professional: boolean;
  has_case: boolean;
  weight_estimate_kg: number;
} {
  const lower = name.toLowerCase();

  // Type
  let type = "furadeira_simples";
  if (lower.includes("martelete") || lower.includes("rompedor")) {
    type = "martelete";
  } else if (lower.includes("parafusadeira") && lower.includes("furadeira")) {
    type = "parafusadeira_furadeira";
  } else if (lower.includes("parafusadeira")) {
    type = "parafusadeira";
  } else if (lower.includes("impacto")) {
    type = "furadeira_impacto";
  } else if (lower.includes("bancada")) {
    type = "furadeira_bancada";
  }

  // Power source
  let power_source = "eletrica";
  if (/bat[eé]ria|sem\s*fio|cordless/i.test(lower)) {
    power_source = "bateria";
  } else if (lower.includes("gasolina") || lower.includes("2t")) {
    power_source = "gasolina";
  }

  // Voltage
  let voltage = "";
  const voltMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*v(?:olt)?/i);
  if (voltMatch) {
    const v = parseFloat(voltMatch[1].replace(",", "."));
    if (v <= 48) {
      voltage = `${Math.round(v)}V`;
    } else if (v === 110 || v === 127) {
      voltage = "110V";
    } else if (v === 220) {
      voltage = "220V";
    }
  }
  if (lower.includes("bivolt")) {
    voltage = "bivolt";
  }

  // Wattage
  let wattage = 0;
  const wattMatch = lower.match(/(\d+)\s*w(?:att)?/i);
  if (wattMatch) {
    const w = parseInt(wattMatch[1]);
    if (w >= 100 && w <= 3000) {
      wattage = w;
    }
  }

  // Chuck size
  let chuck_size = "";
  if (/sds/i.test(lower)) {
    chuck_size = "SDS";
  } else if (/1\/2|13\s*mm/i.test(lower)) {
    chuck_size = '1/2" (13mm)';
  } else if (/3\/8|10\s*mm/i.test(lower)) {
    chuck_size = '3/8" (10mm)';
  }

  const is_professional = /profissional|professional|pro\b/i.test(lower);
  const has_case = /maleta|case|estojo/i.test(lower);

  // Weight estimate (kg) based on type
  const weightMap: Record<string, number> = {
    parafusadeira: 1.2,
    parafusadeira_furadeira: 1.8,
    furadeira_simples: 2.0,
    furadeira_impacto: 2.5,
    martelete: 5.0,
    furadeira_bancada: 15.0,
  };
  let weight_estimate_kg = weightMap[type] ?? 2.0;
  if (has_case) {
    weight_estimate_kg += 1.0;
  }
  if (wattage > 800) {
    weight_estimate_kg += 1.0;
  }

  return {
    type,
    power_source,
    voltage,
    wattage,
    chuck_size,
    is_professional,
    has_case,
    weight_estimate_kg,
  };
}

// ── Price Parsing ──

function parsePrice(price: string): number {
  if (!price) {
    return 0;
  }
  try {
    return parseFloat(price.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
  } catch {
    return 0;
  }
}

// ── Dedup ──

function isDrillProduct(name: string): boolean {
  const lower = name.toLowerCase();
  const drillKeywords = ["furadeira", "parafusadeira", "martelete", "drill", "perfurador"];
  const hasDrillKw = drillKeywords.some((kw) => lower.includes(kw));

  // If it has drill keywords, it's a drill (even if it also mentions accessories)
  if (hasDrillKw) {
    return true;
  }

  // If no drill keyword, it's not a drill product
  return false;
}

function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 60);
}

// ── Supply Chain Classification ──

function classifySupplyChain(brand: string, origin: string, name: string): string {
  if (origin === "china") {
    return "中国品牌/贴牌";
  }
  if (origin === "brazil") {
    return "巴西本土品牌";
  }
  if (origin === "global") {
    return "国际品牌";
  }
  // Heuristic for unknown brands
  const lower = name.toLowerCase();
  if (/21v|48v|sem\s*fio.*(?:led|acess[oó]rios|maleta)/i.test(lower) && parsePrice("") === 0) {
    return "疑似中国贴牌";
  }
  return "未知来源";
}

// ── Main ──

function main() {
  console.log("═══ Data Cleaning Pipeline ═══\n");

  // Load raw data
  const amazon = JSON.parse(readFileSync("/tmp/amazon-drills.json", "utf-8")) as Array<
    Record<string, unknown>
  >;
  const meli = JSON.parse(readFileSync("/tmp/meli-drills.json", "utf-8")) as Array<
    Record<string, unknown>
  >;
  console.log(`Loaded: Amazon ${amazon.length}, MeLi ${meli.length}`);

  const results: CleanedProduct[] = [];
  const seenNames = new Set<string>();
  let filtered = 0;
  let duplicates = 0;
  let priceSuspect = 0;

  // Process all products
  const allRaw = [
    ...amazon.map((p) => ({ ...p, _source: "amazon" as const })),
    ...meli.map((p) => ({ ...p, _source: "meli" as const })),
  ];

  for (const raw of allRaw) {
    const name = String(raw.name || "")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');

    // Filter non-drill products
    if (!isDrillProduct(name)) {
      filtered++;
      continue;
    }

    // Dedup by normalized name
    const normName = normalizeForDedup(name);
    if (seenNames.has(normName)) {
      duplicates++;
      continue;
    }
    seenNames.add(normName);

    // Brand
    const { brand, origin } = identifyBrand(name);

    // Classification
    const cls = classifyProduct(name);

    // Price
    const priceStr = String(raw.price || "");
    const priceNum = parsePrice(priceStr);
    const isSuspect = priceNum > 0 && priceNum < 10;
    if (isSuspect) {
      priceSuspect++;
    }

    // Original price / discount
    const origPriceStr = String(raw.original_price || "");
    const origPriceNum = parsePrice(origPriceStr);
    let discountPct = 0;
    if (origPriceNum > 0 && priceNum > 0 && origPriceNum > priceNum) {
      discountPct = Math.round(((origPriceNum - priceNum) / origPriceNum) * 100);
    }

    // Rating
    const ratingStr = String(raw.rating || "");
    const ratingNum = parseFloat(ratingStr.replace(",", ".")) || 0;

    // Images & SKUs
    const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
    const skus = Array.isArray(raw.skus)
      ? (raw.skus as Array<{ name: string; price?: string; asin?: string }>)
      : [];

    // Supply chain
    const supplyChain = classifySupplyChain(brand, origin, name);

    results.push({
      name,
      source: raw._source,
      brand,
      type: cls.type,
      power_source: cls.power_source,
      voltage: cls.voltage,
      wattage: cls.wattage,
      chuck_size: cls.chuck_size,
      is_professional: cls.is_professional,
      has_case: cls.has_case,
      price: priceStr,
      price_numeric: priceNum,
      price_suspect: isSuspect,
      price_missing: priceNum === 0,
      original_price: origPriceStr,
      discount_pct: discountPct,
      rating: ratingStr,
      rating_numeric: ratingNum,
      reviews: String(raw.reviews || ""),
      sold: String(raw.sold || ""),
      images,
      image_count: images.length,
      link: String(raw.link || ""),
      skus,
      sku_count: skus.length,
      supply_chain: supplyChain,
      weight_estimate_kg: cls.weight_estimate_kg,
    });
  }

  // Stats
  const validPrices = results.filter((p) => p.price_numeric > 0 && !p.price_suspect);
  const brandIdentified = results.filter((p) => p.brand !== "Sem marca");

  console.log(`\n── Cleaning Results ──`);
  console.log(`  Input:      ${allRaw.length}`);
  console.log(`  Filtered:   ${filtered} (non-drill)`);
  console.log(`  Duplicates: ${duplicates}`);
  console.log(`  Output:     ${results.length}`);
  console.log(`  Price suspect: ${priceSuspect}`);
  console.log(
    `  Brand identified: ${brandIdentified.length}/${results.length} (${((brandIdentified.length / results.length) * 100).toFixed(0)}%)`,
  );
  console.log(`  Valid prices: ${validPrices.length}/${results.length}`);

  // Type distribution
  const types: Record<string, number> = {};
  for (const p of results) {
    types[p.type] = (types[p.type] || 0) + 1;
  }
  console.log(`\n── Type Distribution ──`);
  for (const [t, c] of Object.entries(types).toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }

  // Power source
  const powerSources: Record<string, number> = {};
  for (const p of results) {
    powerSources[p.power_source] = (powerSources[p.power_source] || 0) + 1;
  }
  console.log(`\n── Power Source ──`);
  for (const [ps, c] of Object.entries(powerSources).toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${ps}: ${c}`);
  }

  writeFileSync("/tmp/drills-cleaned.json", JSON.stringify(results, null, 2));
  console.log(`\nSaved to /tmp/drills-cleaned.json`);
}

main();
