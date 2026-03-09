import { execFile } from "node:child_process";
import { Type } from "@sinclair/typebox";
import { extendedPythonPath } from "../../agent-reach/extended-path.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const FETCHER_MODES = ["fast", "stealth", "dynamic"] as const;

const ScraplingSchema = Type.Object({
  url: Type.String({ description: "The URL to scrape." }),
  mode: Type.Optional(
    stringEnum(FETCHER_MODES, {
      description:
        'Fetcher mode: "fast" (HTTP with browser fingerprint impersonation, no real browser), "stealth" (real headless browser, bypasses Cloudflare/WAF), "dynamic" (Playwright for JS-heavy SPA pages). Default: "fast".',
      default: "fast",
    }),
  ),
  selector: Type.Optional(
    Type.String({
      description: "CSS selector to extract specific elements. If omitted, returns full page text.",
    }),
  ),
  maxChars: Type.Optional(
    Type.Number({
      description: "Maximum characters to return. Default: 50000.",
      minimum: 100,
    }),
  ),
  solveCloudflare: Type.Optional(
    Type.Boolean({
      description:
        "Attempt to solve Cloudflare challenges automatically. Only works with stealth mode. Default: false.",
    }),
  ),
  proxy: Type.Optional(
    Type.String({
      description: "Proxy URL (e.g. http://user:pass@host:port).",
    }),
  ),
});

const DEFAULT_MAX_CHARS = 50_000;
const EXEC_TIMEOUT_MS = 60_000;

/**
 * Python script that reads parameters from stdin as JSON.
 * This avoids string interpolation of user input into code, preventing injection.
 */
const PYTHON_SCRIPT = `
import json, sys, warnings
warnings.filterwarnings("ignore")

params = json.loads(sys.stdin.read())
url = params["url"]
mode = params.get("mode", "fast")
selector = params.get("selector")
max_chars = params.get("maxChars", 50000)
solve_cf = params.get("solveCloudflare", False)
proxy = params.get("proxy")

proxy_kw = {"proxy": proxy} if proxy else {}

if mode == "stealth":
    from scrapling import StealthyFetcher
    fetch_kw = {"headless": True, "network_idle": True, **proxy_kw}
    if solve_cf:
        fetch_kw["solve_cloudflare"] = True
    page = StealthyFetcher().fetch(url, **fetch_kw)
elif mode == "dynamic":
    from scrapling import PlayWrightFetcher
    page = PlayWrightFetcher().fetch(url, network_idle=True, disable_resources=True, **proxy_kw)
else:
    from scrapling import Fetcher
    page = Fetcher().get(url, **proxy_kw)

if selector:
    items = page.css(selector)
    texts = [str(item.text) for item in items]
    result = {"status": page.status, "selector": selector, "count": len(texts), "items": texts[:100]}
else:
    text = page.get_all_text()
    result = {"status": page.status, "length": len(text), "text": text[:max_chars]}

print(json.dumps(result, ensure_ascii=False))
`.trim();

function runPython(
  script: string,
  stdinData?: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: extendedPythonPath() };
    const child = execFile(
      "python3",
      ["-c", script],
      { timeout: EXEC_TIMEOUT_MS, env, maxBuffer: 10_000_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    if (stdinData && child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

export function createScraplingTool(): AnyAgentTool | null {
  return {
    label: "Scrapling",
    name: "scrapling",
    description:
      "Scrape web pages with anti-bot bypass. Use when web_fetch fails due to Cloudflare, WAF, or anti-bot protection. Supports three modes: fast (HTTP fingerprint impersonation), stealth (real browser, bypasses Cloudflare), dynamic (Playwright for JS-heavy pages). Can extract specific elements with CSS selectors.",
    parameters: ScraplingSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });
      if (!url) {
        return jsonResult({ error: "url is required" });
      }
      const mode = readStringParam(params, "mode") ?? "fast";
      const selector = readStringParam(params, "selector");
      const maxChars = readNumberParam(params, "maxChars", { integer: true }) ?? DEFAULT_MAX_CHARS;
      const solveCloudflare = params.solveCloudflare === true;
      const proxy = readStringParam(params, "proxy");

      const stdinPayload = JSON.stringify({
        url,
        mode,
        selector: selector ?? undefined,
        maxChars,
        solveCloudflare,
        proxy: proxy ?? undefined,
      });

      try {
        const { stdout } = await runPython(PYTHON_SCRIPT, stdinPayload);
        const result = JSON.parse(stdout.trim());
        return jsonResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("No module named 'scrapling'")) {
          return jsonResult({
            error: "scrapling not installed",
            hint: 'pip3 install "scrapling[all]" && scrapling install',
          });
        }
        if (message.includes("Executable doesn't exist")) {
          return jsonResult({
            error: "scrapling browser not installed",
            hint: "Run: scrapling install",
          });
        }
        return jsonResult({ error: message });
      }
    },
  };
}
