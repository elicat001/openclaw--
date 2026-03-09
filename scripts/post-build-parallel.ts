/**
 * Runs independent post-build scripts in parallel to speed up the build pipeline.
 *
 * Scripts that depend on `build:plugin-sdk:dts` (write-plugin-sdk-entry-dts.ts)
 * must run after it completes, so they are NOT included here.
 *
 * All scripts listed below only depend on the tsdown output (dist/) being present
 * and can safely run concurrently.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

interface ScriptDef {
  name: string;
  args: string[];
}

const scripts: ScriptDef[] = [
  {
    name: "canvas-a2ui-copy",
    args: ["--import", "tsx", path.join(scriptDir, "canvas-a2ui-copy.ts")],
  },
  {
    name: "copy-hook-metadata",
    args: ["--import", "tsx", path.join(scriptDir, "copy-hook-metadata.ts")],
  },
  {
    name: "copy-export-html-templates",
    args: ["--import", "tsx", path.join(scriptDir, "copy-export-html-templates.ts")],
  },
  {
    name: "write-build-info",
    args: ["--import", "tsx", path.join(scriptDir, "write-build-info.ts")],
  },
  {
    name: "write-cli-startup-metadata",
    args: ["--import", "tsx", path.join(scriptDir, "write-cli-startup-metadata.ts")],
  },
  {
    name: "write-cli-compat",
    args: ["--import", "tsx", path.join(scriptDir, "write-cli-compat.ts")],
  },
];

function runScript(script: ScriptDef): Promise<{ name: string; ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      script.args,
      { cwd: path.resolve(scriptDir, "..") },
      (error, _stdout, stderr) => {
        if (error) {
          console.error(`[post-build] FAILED: ${script.name}`);
          if (stderr) {
            console.error(stderr);
          }
          resolve({ name: script.name, ok: false, stderr: stderr || error.message });
        } else {
          resolve({ name: script.name, ok: true, stderr: "" });
        }
      },
    );
    child.stdout?.pipe(process.stdout);
  });
}

const startTime = Date.now();
console.log(`[post-build] Running ${scripts.length} scripts in parallel...`);

const results = await Promise.all(scripts.map(runScript));
const elapsed = Date.now() - startTime;

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(
    `[post-build] ${failed.length} script(s) failed: ${failed.map((f) => f.name).join(", ")}`,
  );
  process.exit(1);
}

console.log(`[post-build] All ${scripts.length} scripts completed in ${elapsed}ms`);
