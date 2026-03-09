/**
 * Agent Reach doctor — native TypeScript platform availability checks.
 *
 * Checks whether upstream tools (yt-dlp, xreach, mcporter, gh, etc.)
 * are installed and accessible on the system PATH.
 */
import { execFile } from "node:child_process";
import { extendedPythonPath } from "./extended-path.js";
import { PLATFORMS } from "./platforms.js";
import type { AgentReachPlatform, AgentReachStatus } from "./types.js";

function hasBinary(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    const env = { ...process.env, PATH: extendedPythonPath() };
    execFile(cmd, [name], { timeout: 5000, env }, (err) => {
      resolve(!err);
    });
  });
}

/** Check if a Python module is importable. */
function hasPythonModule(moduleName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: extendedPythonPath() };
    execFile("python3", ["-c", `import ${moduleName}`], { timeout: 5000, env }, (err) => {
      resolve(!err);
    });
  });
}

async function checkXreachAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("xreach", ["auth", "check"], { timeout: 5000 }, (err, stdout) => {
      resolve(!err && (stdout ?? "").includes("authenticated"));
    });
  });
}

async function checkGhAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "status"], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Run all platform availability checks.
 * Pure TypeScript — no Python dependency.
 */
export async function runDoctor(): Promise<AgentReachStatus> {
  // Pre-check all unique binaries in parallel
  const allBins = new Set<string>();
  for (const p of PLATFORMS) {
    for (const b of p.requiredBins) {
      allBins.add(b);
    }
    for (const b of p.optionalBins ?? []) {
      allBins.add(b);
    }
  }

  const binChecks = new Map<string, boolean>();
  await Promise.all(
    [...allBins].map(async (bin) => {
      binChecks.set(bin, await hasBinary(bin));
    }),
  );

  // Pre-check all unique Python modules in parallel
  const allPyMods = new Set<string>();
  for (const p of PLATFORMS) {
    for (const m of p.requiredPyModules ?? []) {
      allPyMods.add(m);
    }
  }

  const pyModChecks = new Map<string, boolean>();
  if (allPyMods.size > 0) {
    await Promise.all(
      [...allPyMods].map(async (mod) => {
        pyModChecks.set(mod, await hasPythonModule(mod));
      }),
    );
  }

  // Check each platform
  const platforms: AgentReachPlatform[] = [];

  for (const def of PLATFORMS) {
    const requiredBinsMet = def.requiredBins.every((b) => binChecks.get(b));
    const requiredModsMet = (def.requiredPyModules ?? []).every((m) => pyModChecks.get(m));
    const requiredMet = requiredBinsMet && requiredModsMet;
    const hasOptional = (def.optionalBins ?? []).some((b) => binChecks.get(b));

    let status: AgentReachPlatform["status"];
    let message: string;

    if (def.requiredBins.length === 0 && hasOptional) {
      // Platforms with only optional bins (linkedin, bosszhipin)
      status = "ok";
      message = "Available via Jina Reader (curl).";
    } else if (def.requiredBins.length === 0 && !hasOptional) {
      status = "warn";
      message = def.installHint;
    } else if (requiredMet) {
      status = "ok";
      message = `Available (${def.backends.join(", ")}).`;
    } else {
      status = "off";
      const missingBins = def.requiredBins.filter((b) => !binChecks.get(b));
      const missingMods = (def.requiredPyModules ?? []).filter((m) => !pyModChecks.get(m));
      const missing = [...missingBins, ...missingMods.map((m) => `python:${m}`)];
      message = `Missing: ${missing.join(", ")}. ${def.installHint}`;
    }

    platforms.push({
      name: def.name,
      label: def.label,
      status,
      message,
      backends: def.backends,
      tier: def.tier,
    });
  }

  // Extra checks for specific platforms
  for (const p of platforms) {
    if (p.name === "twitter" && p.status === "ok") {
      const authed = await checkXreachAuth();
      if (!authed) {
        p.status = "warn";
        p.message = "xreach installed but not authenticated. Run: xreach auth login";
      }
    }
    if (p.name === "github" && p.status === "ok") {
      const authed = await checkGhAuth();
      if (!authed) {
        p.status = "warn";
        p.message = "gh installed but not authenticated. Run: gh auth login";
      }
    }
  }

  const availableCount = platforms.filter((p) => p.status === "ok").length;

  return {
    installed: true,
    platforms,
    availableCount,
    totalCount: platforms.length,
  };
}

/**
 * Format doctor results for terminal output.
 */
export function formatDoctorReport(status: AgentReachStatus): string {
  const lines: string[] = [];
  lines.push("Agent Reach — Internet Access Status");
  lines.push("=".repeat(42));
  lines.push("");

  const tiers = [
    { tier: 0, title: "Zero-config (ready to use)" },
    { tier: 1, title: "Needs free key or proxy" },
    { tier: 2, title: "Needs setup (Docker/cookies)" },
  ];

  for (const { tier, title } of tiers) {
    const group = status.platforms.filter((p) => p.tier === tier);
    if (group.length === 0) {
      continue;
    }

    lines.push(`  ${title}:`);
    for (const p of group) {
      const icon =
        p.status === "ok"
          ? "\u2705"
          : p.status === "warn"
            ? "\u26a0\ufe0f "
            : p.status === "error"
              ? "\u274c"
              : "--";
      lines.push(`    ${icon} ${p.label} \u2014 ${p.message}`);
    }
    lines.push("");
  }

  lines.push(`Status: ${status.availableCount}/${status.totalCount} platforms available`);
  return lines.join("\n");
}
