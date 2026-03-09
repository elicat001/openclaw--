import { execFile } from "node:child_process";
import { Type } from "@sinclair/typebox";
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

/** Build PATH that includes common user-install locations for pip binaries. */
function extendedPath(): string {
  const home = process.env.HOME ?? "";
  const extra = [
    `${home}/Library/Python/3.9/bin`,
    `${home}/Library/Python/3.10/bin`,
    `${home}/Library/Python/3.11/bin`,
    `${home}/Library/Python/3.12/bin`,
    `${home}/Library/Python/3.13/bin`,
    `${home}/Library/Python/3.14/bin`,
    `${home}/.local/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  return `${extra.join(":")}:${process.env.PATH ?? ""}`;
}

function runPython(script: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: extendedPath() };
    execFile(
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
  });
}

function buildScript(opts: {
  url: string;
  mode: string;
  selector?: string;
  maxChars: number;
  solveCloudflare: boolean;
  proxy?: string;
}): string {
  const proxyArg = opts.proxy ? `, proxy='${opts.proxy.replace(/'/g, "\\'")}'` : "";
  const urlEscaped = opts.url.replace(/'/g, "\\'");
  const selectorEscaped = opts.selector?.replace(/'/g, "\\'");

  let fetchLine: string;
  switch (opts.mode) {
    case "stealth":
      fetchLine = `page = StealthyFetcher().fetch('${urlEscaped}', headless=True, network_idle=True${opts.solveCloudflare ? ", solve_cloudflare=True" : ""}${proxyArg})`;
      break;
    case "dynamic":
      fetchLine = `page = PlayWrightFetcher().fetch('${urlEscaped}', network_idle=True, disable_resources=True${proxyArg})`;
      break;
    default:
      fetchLine = `page = Fetcher().get('${urlEscaped}'${proxyArg})`;
      break;
  }

  const importLine =
    opts.mode === "stealth"
      ? "from scrapling import StealthyFetcher"
      : opts.mode === "dynamic"
        ? "from scrapling import PlayWrightFetcher"
        : "from scrapling import Fetcher";

  const extractBlock = selectorEscaped
    ? `
items = page.css('${selectorEscaped}')
texts = [item.text() for item in items]
result = {"status": page.status, "selector": '${selectorEscaped}', "count": len(texts), "items": texts[:100]}
`
    : `
text = page.get_all_text()
result = {"status": page.status, "length": len(text), "text": text[:${opts.maxChars}]}
`;

  return `
import json, warnings
warnings.filterwarnings("ignore")
${importLine}
${fetchLine}
${extractBlock}
print(json.dumps(result, ensure_ascii=False))
`.trim();
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

      const script = buildScript({ url, mode, selector, maxChars, solveCloudflare, proxy });

      try {
        const { stdout } = await runPython(script);
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
