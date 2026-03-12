/**
 * Script execution wrapper — spawns existing CLI scripts as child processes.
 * No modifications to scripts; pure external invocation.
 */
import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "..");
const SCRIPTS_DIR = resolve(PROJECT_ROOT, "scripts");

export type ScriptHandle = {
  process: ChildProcess;
  outputDir: string;
};

function spawnScript(script: string, args: string[]): ChildProcess {
  return spawn("npx", ["tsx", resolve(SCRIPTS_DIR, script), ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runCrawl(params: {
  keyword: string;
  platforms?: string[];
  max?: number;
}): ScriptHandle {
  const keyword = params.keyword;
  const slug = keyword.toLowerCase().replace(/\s+/g, "-");
  const outputDir = `/tmp/market-research-${slug}`;
  const args = [
    "--keyword",
    keyword,
    "--platforms",
    (params.platforms || ["amazon-us", "amazon-br"]).join(","),
    "--max",
    String(params.max || 50),
  ];

  return { process: spawnScript("crawl.ts", args), outputDir };
}

export function runDiscover(params: {
  category: string;
  maxKeywords?: number;
  maxPerKeyword?: number;
  outputDir?: string;
}): ScriptHandle {
  const outputDir = params.outputDir || `/tmp/discovery-${params.category}`;
  const args = [
    "--category",
    params.category,
    "--max-keywords",
    String(params.maxKeywords || 10),
    "--max-per-keyword",
    String(params.maxPerKeyword || 50),
    "--output-dir",
    outputDir,
  ];

  return { process: spawnScript("discover.ts", args), outputDir };
}

export function runOpportunity(params: {
  usData: string;
  brData: string;
  category?: string;
}): ScriptHandle {
  const args = ["--us-data", params.usData, "--br-data", params.brData];
  if (params.category) args.push("--category", params.category);

  // Output dir is the directory containing BR data
  const outputDir = resolve(params.brData, "..");
  return { process: spawnScript("opportunity.ts", args), outputDir };
}

// Category slugs (mirrored from discover.ts for the frontend)
export const CATEGORY_SLUGS: Record<string, string> = {
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
