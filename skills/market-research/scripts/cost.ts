/**
 * Cost estimation module for cross-border e-commerce (China -> Brazil).
 * Uses experience-based formulas with a calibration interface for 1688 data.
 */

export type CostEstimate = {
  factoryCost: number; // Estimated factory/wholesale price (BRL)
  shippingCost: number; // China->Brazil shipping (BRL)
  importDuty: number; // Brazilian import taxes (ICMS + II, ~60%)
  fbaFee: number; // FBA fulfillment fee (BRL)
  platformFee: number; // Marketplace commission (~15-16%)
  totalCost: number; // Sum of all costs
  margin: number; // sellingPrice - totalCost - platformFee
  marginPct: number; // margin / sellingPrice
  confidence: "low" | "medium" | "high";
};

export type CostCalibration = {
  source: "formula" | "1688";
  factoryCost: number;
  confidence: "low" | "medium" | "high";
  referenceUrl?: string;
};

// Input type - minimal fields needed for cost estimation
export type CostInput = {
  price_numeric: number;
  supply_chain: string;
  weight_estimate_kg: number;
};

// Factory cost ratio by supply chain origin (percentage of selling price)
const FACTORY_COST_RATIOS: Record<string, number> = {
  "Chinese brand / OEM": 0.2,
  "Suspected Chinese OEM": 0.25,
  "Brazilian local brand": 0.4,
  "International brand": 0.5,
  "Unknown origin": 0.3,
};

// Shipping cost per kg (sea freight China->Brazil, averaged)
const SHIPPING_PER_KG_BRL = 8.0;

// Brazilian import duty rate (ICMS + II for electronics/tools)
const IMPORT_DUTY_RATE = 0.6;

// FBA fee tiers by weight (BRL)
const FBA_TIERS: Array<{ maxKg: number; fee: number }> = [
  { maxKg: 1, fee: 15.9 },
  { maxKg: 2, fee: 19.9 },
  { maxKg: 5, fee: 25.9 },
  { maxKg: 10, fee: 35.9 },
  { maxKg: Infinity, fee: 55.9 },
];

// Platform commission rates
const PLATFORM_COMMISSION = 0.16; // ~15% Amazon BR, ~16% MeLi -> use 16%

export function estimateCost(product: CostInput, calibration?: CostCalibration): CostEstimate {
  const { price_numeric, supply_chain, weight_estimate_kg } = product;

  // Factory cost
  let factoryCost: number;
  let confidence: "low" | "medium" | "high";

  if (calibration?.source === "1688") {
    factoryCost = calibration.factoryCost;
    confidence = calibration.confidence;
  } else {
    const ratio = FACTORY_COST_RATIOS[supply_chain] ?? 0.3;
    factoryCost = price_numeric * ratio;
    confidence = "medium";
  }

  // Shipping
  const weight = weight_estimate_kg > 0 ? weight_estimate_kg : 2.0;
  const shippingCost = weight * SHIPPING_PER_KG_BRL;

  // Import duty
  const importDuty = factoryCost * IMPORT_DUTY_RATE;

  // FBA fee
  const tier = FBA_TIERS.find((t) => weight <= t.maxKg);
  const fbaFee = tier?.fee ?? 55.9;

  // Platform fee
  const platformFee = price_numeric * PLATFORM_COMMISSION;

  // Total and margin
  const totalCost = factoryCost + shippingCost + importDuty + fbaFee;
  const margin = price_numeric - totalCost - platformFee;
  const marginPct = price_numeric > 0 ? margin / price_numeric : 0;

  return {
    factoryCost,
    shippingCost,
    importDuty,
    fbaFee,
    platformFee,
    totalCost,
    margin,
    marginPct,
    confidence,
  };
}

/**
 * Estimate cost at a target selling price (for "what if I sell at X?" scenarios).
 */
export function estimateCostAtPrice(
  targetPrice: number,
  product: CostInput,
  calibration?: CostCalibration,
): CostEstimate {
  return estimateCost({ ...product, price_numeric: targetPrice }, calibration);
}

/**
 * Format cost estimate as a readable summary line.
 */
export function formatCostSummary(est: CostEstimate): string {
  return [
    `Factory: R$${est.factoryCost.toFixed(0)}`,
    `Ship: R$${est.shippingCost.toFixed(0)}`,
    `Tax: R$${est.importDuty.toFixed(0)}`,
    `FBA: R$${est.fbaFee.toFixed(0)}`,
    `Commission: R$${est.platformFee.toFixed(0)}`,
    `Total: R$${est.totalCost.toFixed(0)}`,
    `Margin: R$${est.margin.toFixed(0)} (${(est.marginPct * 100).toFixed(0)}%)`,
  ].join(" | ");
}
