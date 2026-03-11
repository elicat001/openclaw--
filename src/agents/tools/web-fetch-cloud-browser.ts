/**
 * Unified cloud browser API for managed anti-bot services.
 * Supports Firecrawl, ScrapFly, and Bright Data Web Unlocker as fallback
 * when local engines (curl_cffi, Camoufox, Scrapling) are insufficient.
 */

export type CloudBrowserProvider = "firecrawl" | "scrapfly" | "brightdata";

export type CloudBrowserConfig = {
  provider: CloudBrowserProvider;
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
};

export type CloudBrowserResult = {
  text: string;
  status: number;
  provider: CloudBrowserProvider;
  url: string;
};

/**
 * Fetch a URL via a managed cloud browser service.
 * Returns null if the provider is unavailable or the request fails.
 */
export async function fetchViaCloudBrowser(params: {
  url: string;
  config: CloudBrowserConfig;
  maxChars?: number;
}): Promise<CloudBrowserResult | null> {
  const { url, config, maxChars = 50_000 } = params;

  switch (config.provider) {
    case "scrapfly":
      return fetchViaScrapFly(url, config, maxChars);
    case "brightdata":
      return fetchViaBrightData(url, config, maxChars);
    default:
      // Firecrawl is handled separately via existing integration
      return null;
  }
}

async function fetchViaScrapFly(
  url: string,
  config: CloudBrowserConfig,
  maxChars: number,
): Promise<CloudBrowserResult | null> {
  const baseUrl = config.baseUrl ?? "https://api.scrapfly.io";
  const timeout = config.timeout ?? 30_000;

  const endpoint = `${baseUrl}/scrape?key=${encodeURIComponent(config.apiKey)}&url=${encodeURIComponent(url)}&render_js=true&asp=true`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      result?: { content?: string; status_code?: number };
    };
    let text = data.result?.content ?? "";
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
    }

    return {
      text,
      status: data.result?.status_code ?? 200,
      provider: "scrapfly",
      url,
    };
  } catch {
    return null;
  }
}

async function fetchViaBrightData(
  url: string,
  config: CloudBrowserConfig,
  maxChars: number,
): Promise<CloudBrowserResult | null> {
  const baseUrl = config.baseUrl ?? "https://api.brightdata.com";
  const timeout = config.timeout ?? 30_000;

  const endpoint = `${baseUrl}/request`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        zone: "web_unlocker",
        format: "raw",
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      return null;
    }

    let text = await response.text();
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
    }

    return {
      text,
      status: response.status,
      provider: "brightdata",
      url,
    };
  } catch {
    return null;
  }
}

/**
 * Detect available cloud browser providers from environment variables.
 */
export function detectCloudBrowserProviders(): CloudBrowserConfig[] {
  const configs: CloudBrowserConfig[] = [];

  const scrapflyKey = process.env.SCRAPFLY_API_KEY;
  if (scrapflyKey) {
    configs.push({ provider: "scrapfly", apiKey: scrapflyKey });
  }

  const brightdataKey = process.env.BRIGHTDATA_API_KEY;
  if (brightdataKey) {
    configs.push({ provider: "brightdata", apiKey: brightdataKey });
  }

  return configs;
}
