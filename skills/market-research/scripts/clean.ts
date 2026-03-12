#!/usr/bin/env tsx
/**
 * Generalized data cleaning pipeline for market research crawl data.
 * Reads raw JSON from an input directory, outputs cleaned + enriched JSON.
 *
 * Usage:
 *   tsx clean.ts --input <dir> [--brands <category>] [--output <file>]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseArgs } from "node:util";
import { loadBrands, type BrandEntry } from "./brands/index.ts";

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

// ── Brand Identification ──

function identifyBrand(name: string, brands: BrandEntry[]): { brand: string; origin: string } {
  const upper = name.toUpperCase();

  // 1. Exact pattern match against loaded brand DB
  for (const entry of brands) {
    for (const pattern of entry.patterns) {
      if (upper.includes(pattern)) {
        return { brand: entry.name, origin: entry.origin };
      }
    }
  }

  // 2. First-word extraction for unknown brands
  const productWords = new Set([
    // Tools / drills
    "FURADEIRA",
    "PARAFUSADEIRA",
    "MARTELETE",
    "CHAVE",
    "BRUSHLESS",
    "ELETROPNEUMÁTICO",
    "ELETROPNEUMATICO",
    // Baby products
    "MAMADEIRA",
    "MAMADEIRAS",
    "BONECA",
    "BONECO",
    "BICO",
    "BICOS",
    "POTE",
    "COPO",
    "BOLSA",
    "BOLSAS",
    "AQUECEDOR",
    "ESTERILIZADOR",
    "CHUPETA",
    "BABADOR",
    // Kitchen / home
    "PANELA",
    "FRIGIDEIRA",
    "CAFETEIRA",
    "LIQUIDIFICADOR",
    "ASPIRADOR",
    // Electronics
    "FONE",
    "CABO",
    "CARREGADOR",
    "CAIXA",
    // Generic product/marketing words
    "KIT",
    "KITS",
    "JOGO",
    "CONJUNTO",
    "CONJ",
    "MINI",
    "SUPER",
    "NOVA",
    "NOVO",
    "PRO",
    "THE",
    "NEW",
    "BEST",
    "TOP",
    "SET",
    "PACK",
    "CASE",
    "BOX",
    "PAR",
    "POTE",
    "ALÇA",
  ]);
  const firstWord = name
    .split(/[\s,]+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (firstWord.length >= 3 && !productWords.has(firstWord)) {
    return { brand: name.split(/[\s,]+/)[0], origin: "unknown" };
  }

  return { brand: "Unknown", origin: "unknown" };
}

// ── Product Classification (drill-specific) ──

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

// ── Generic Product Classification (non-drill categories) ──

function classifyProductGeneric(name: string): {
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

  // Voltage (generic)
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

  // Wattage (generic)
  let wattage = 0;
  const wattMatch = lower.match(/(\d+)\s*w(?:att)?/i);
  if (wattMatch) {
    const w = parseInt(wattMatch[1]);
    if (w >= 1 && w <= 10000) {
      wattage = w;
    }
  }

  // Weight estimation based on product name keywords
  let weight_estimate_kg = 0.5; // Default for small consumer goods
  const weightKeywords: Array<[RegExp, number]> = [
    // Baby products
    [/mamadeira|bottle|bico/i, 0.2],
    [/kit.*mamadeira|kit.*bottle/i, 0.5],
    [/esterilizador|sterilizer/i, 1.0],
    [/aquecedor/i, 0.8],
    [/chupeta|pacifier/i, 0.05],
    // Electronics
    [/fone|earphone|headphone/i, 0.3],
    [/carregador|charger/i, 0.2],
    [/tablet/i, 0.6],
    [/notebook|laptop/i, 2.5],
    // Kitchen
    [/panela|frigideira|pot|pan/i, 1.5],
    [/cafeteira|coffee\s*maker/i, 2.0],
    [/liquidificador|blender/i, 2.0],
    // Home
    [/aspirador|vacuum/i, 3.0],
    [/ventilador|fan/i, 3.0],
    // Small accessories
    [/cabo|cable|capa|case|cover/i, 0.1],
    [/bolsa|bag/i, 0.8],
    // Toys
    [/boneca|boneco|doll/i, 0.8],
    [/brinquedo|toy/i, 0.5],
  ];

  for (const [pattern, weight] of weightKeywords) {
    if (pattern.test(lower)) {
      weight_estimate_kg = weight;
      break;
    }
  }

  return {
    type: "generic",
    power_source: "",
    voltage,
    wattage,
    chuck_size: "",
    is_professional: false,
    has_case: false,
    weight_estimate_kg,
  };
}

// ── Product Relevance Filters ──

/** Drill-specific: only keep products with drill keywords */
function isDrillProduct(name: string): boolean {
  const lower = name.toLowerCase();
  const drillKeywords = ["furadeira", "parafusadeira", "martelete", "drill", "perfurador"];
  return drillKeywords.some((kw) => lower.includes(kw));
}

/** Generic: keep products with reasonable names (skip obvious non-product entries) */
function isRelevantProduct(name: string): boolean {
  if (name.length <= 10) {
    return false;
  }
  // Skip entries that look like navigation/UI artifacts
  const junkPatterns = [
    /^ver\s+mais$/i,
    /^voltar$/i,
    /^menu$/i,
    /^home$/i,
    /^search$/i,
    /^null$/i,
    /^undefined$/i,
    /^\d+$/,
  ];
  for (const pat of junkPatterns) {
    if (pat.test(name.trim())) {
      return false;
    }
  }
  return true;
}

// ── Price Parsing ──

function parsePrice(price: string): number {
  if (!price) {
    return 0;
  }
  try {
    return parseFloat(
      price
        .replace(/R\$|US\$|\$|€|£/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim(),
    );
  } catch {
    return 0;
  }
}

// ── Dedup ──

function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 60);
}

// ── Supply Chain Classification ──

function classifySupplyChain(brand: string, origin: string, name: string): string {
  if (origin === "china") {
    return "Chinese brand / OEM";
  }
  if (origin === "brazil") {
    return "Brazilian local brand";
  }
  if (origin === "global") {
    return "International brand";
  }
  // Heuristic for unknown brands
  const lower = name.toLowerCase();
  if (/21v|48v|sem\s*fio.*(?:led|acess[oó]rios|maleta)/i.test(lower)) {
    return "Suspected Chinese OEM";
  }
  return "Unknown origin";
}

// ── Source Detection ──

/** Detect marketplace source from filename or product data */
function detectSource(filename: string, product: Record<string, unknown>): string {
  const lower = filename.toLowerCase();
  if (lower.includes("amazon")) {
    return "amazon";
  }
  if (lower.includes("meli") || lower.includes("mercadolibre") || lower.includes("mercadolivre")) {
    return "meli";
  }
  if (lower.includes("shopee")) {
    return "shopee";
  }
  if (lower.includes("aliexpress")) {
    return "aliexpress";
  }
  if (lower.includes("magalu") || lower.includes("magazineluiza")) {
    return "magalu";
  }
  // Fall back to product's source field
  if (typeof product.source === "string" && product.source.length > 0) {
    return product.source;
  }
  // Fall back to filename without extension
  return basename(filename, ".json");
}

// ── Main ──

function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      brands: { type: "string", default: "auto" },
      output: { type: "string" },
    },
    strict: true,
  });

  if (!values.input) {
    console.error("Usage: tsx clean.ts --input <dir> [--brands <category>] [--output <file>]");
    process.exit(1);
  }

  const inputDir = values.input;
  const brandsCategory = values.brands ?? "auto";
  const outputPath = values.output ?? join(inputDir, "cleaned.json");

  console.log("=== Data Cleaning Pipeline ===\n");
  console.log(`Input dir:  ${inputDir}`);
  console.log(`Brands:     ${brandsCategory}`);
  console.log(`Output:     ${outputPath}`);

  // Load brand database
  const brands = brandsCategory === "auto" ? loadBrands() : loadBrands(brandsCategory);

  // Scan input directory for JSON files
  const jsonFiles = readdirSync(inputDir)
    .filter((f) => f.endsWith(".json") && f !== "cleaned.json")
    .toSorted();

  if (jsonFiles.length === 0) {
    console.error(`No JSON files found in ${inputDir}`);
    process.exit(1);
  }

  // Load all raw data
  const allRaw: Array<Record<string, unknown> & { _source: string }> = [];
  for (const file of jsonFiles) {
    const filePath = join(inputDir, file);
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as Array<Record<string, unknown>>;
    console.log(`  Loaded ${file}: ${data.length} products`);
    for (const product of data) {
      const source = detectSource(file, product);
      allRaw.push({ ...product, _source: source });
    }
  }

  console.log(`\nTotal raw products: ${allRaw.length}`);

  // Choose the relevance filter based on category
  const filterFn = brandsCategory === "drills" ? isDrillProduct : isRelevantProduct;

  // Choose the classifier based on category
  const classifyFn = brandsCategory === "drills" ? classifyProduct : classifyProductGeneric;

  const results: CleanedProduct[] = [];
  const seenNames = new Set<string>();
  let filtered = 0;
  let duplicates = 0;
  let priceSuspect = 0;

  for (const raw of allRaw) {
    const name = String(raw.name || "")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');

    // Filter irrelevant products
    if (!filterFn(name)) {
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
    const { brand, origin } = identifyBrand(name, brands);

    // Classification
    const cls = classifyFn(name);

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
      ? (raw.skus as Array<{ name: string; price?: string; id?: string }>)
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
  const brandIdentified = results.filter((p) => p.brand !== "Unknown");

  console.log(`\n-- Cleaning Results --`);
  console.log(`  Input:      ${allRaw.length}`);
  console.log(`  Filtered:   ${filtered} (irrelevant)`);
  console.log(`  Duplicates: ${duplicates}`);
  console.log(`  Output:     ${results.length}`);
  console.log(`  Price suspect: ${priceSuspect}`);
  if (results.length > 0) {
    console.log(
      `  Brand identified: ${brandIdentified.length}/${results.length} (${((brandIdentified.length / results.length) * 100).toFixed(0)}%)`,
    );
  }
  console.log(`  Valid prices: ${validPrices.length}/${results.length}`);

  // Type distribution
  const types: Record<string, number> = {};
  for (const p of results) {
    types[p.type] = (types[p.type] || 0) + 1;
  }
  console.log(`\n-- Type Distribution --`);
  for (const [t, c] of Object.entries(types).toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }

  // Source distribution
  const sources: Record<string, number> = {};
  for (const p of results) {
    sources[p.source] = (sources[p.source] || 0) + 1;
  }
  console.log(`\n-- Source Distribution --`);
  for (const [s, c] of Object.entries(sources).toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${c}`);
  }

  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${results.length} products to ${outputPath}`);
}

main();
