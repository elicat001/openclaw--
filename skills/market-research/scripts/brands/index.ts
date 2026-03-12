import { drillBrands } from "./drills.ts";
import { genericBrands } from "./generic.ts";

export type BrandEntry = {
  patterns: string[];
  name: string;
  origin: "global" | "brazil" | "china" | "unknown";
};

export function loadBrands(category?: string): BrandEntry[] {
  if (category === "drills") {
    return [...drillBrands, ...genericBrands];
  }
  return genericBrands;
}
