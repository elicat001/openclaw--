/**
 * Mercado Livre crawler module.
 * Phase 1: Search pages → collect product links
 * Phase 2: Detail pages → extract all images + SKU variants
 */
import { execFile } from "node:child_process";
import type { CrawlerModule, CrawlOptions, RawProduct } from "./types.ts";

// ── Internal types ──

type SearchResult = {
  name: string;
  price: string;
  rating: string;
  reviews: string;
  sold: string;
  image: string;
  link: string;
};

type DetailResult = {
  images: string[];
  price: string;
  original_price: string;
  skus: Array<{ name: string; price: string }>;
};

// ── Helpers ──

function curlFetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-s",
        "-L",
        "--max-time",
        "30",
        "-H",
        "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "-H",
        "Accept: text/html",
        "-H",
        "Accept-Language: pt-BR,pt;q=0.9",
        "--compressed",
        url,
      ],
      { maxBuffer: 20_000_000 },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSearchResults(html: string): Promise<SearchResult[]> {
  const script = String.raw`
import json, sys, re

html = sys.stdin.read()
products = []

blocks = re.split(r'<li[^>]*class="[^"]*ui-search-layout__item[^"]*"', html)

for block in blocks[1:]:
    name = ""
    name_m = re.search(r'class="[^"]*poly-component__title[^"]*"[^>]*>(.*?)</[ah]', block, re.DOTALL)
    if name_m:
        name = re.sub(r'<[^>]+>', '', name_m.group(1)).strip()
    if not name:
        name_m = re.search(r'title="([^"]{10,})"', block)
        if name_m:
            name = name_m.group(1).strip()
    if not name or len(name) < 5:
        continue

    name = name.replace('&amp;', '&').replace('&#39;', "'").replace('&quot;', '"')

    price = ""
    price_m = re.search(r'class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>(\d[\d.]*)', block)
    if price_m:
        price = f"R$ {price_m.group(1)}"
        cents_m = re.search(r'class="[^"]*andes-money-amount__cents[^"]*"[^>]*>(\d+)', block)
        if cents_m:
            price += f",{cents_m.group(1)}"

    rating = ""
    rating_m = re.search(r'class="[^"]*poly-reviews__rating[^"]*"[^>]*>([\d,.]+)', block)
    if not rating_m:
        rating_m = re.search(r'aria-label="([0-9,.]+)\s+de\s+5', block)
    if rating_m:
        rating = rating_m.group(1)

    reviews = ""
    rev_m = re.search(r'class="[^"]*poly-reviews__total[^"]*"[^>]*>\(?(\d[\d.]*)', block)
    if rev_m:
        reviews = rev_m.group(1)

    sold = ""
    sold_m = re.search(r'(\d[\d.]*\+?\s*vendido)', block)
    if sold_m:
        sold = sold_m.group(1)

    image = ""
    img_m = re.search(r'<img[^>]*(?:data-src|src)="(https://[^"]*meli[^"]*\.(?:jpg|png|webp)[^"]*)"', block)
    if not img_m:
        img_m = re.search(r'<img[^>]*(?:data-src|src)="(https://http2\.mlstatic\.com[^"]*)"', block)
    if img_m:
        image = img_m.group(1)

    link = ""
    link_m = re.search(r'href="(https://[^"]*mercadolivre[^"]*MLB[^"]*)"', block)
    if not link_m:
        link_m = re.search(r'href="(https://[^"]*mlb[^"]*)"', block, re.I)
    if not link_m:
        link_m = re.search(r'href="(https://(?:produto|www)\.mercadolivre\.com\.br[^"]*)"', block)
    if link_m:
        link = link_m.group(1).split('#')[0].split('?')[0]

    products.append({
        "name": name, "price": price, "rating": rating,
        "reviews": reviews, "sold": sold, "image": image, "link": link,
    })

print(json.dumps(products, ensure_ascii=False))
`;
  return new Promise((resolve) => {
    const child = execFile("python3", ["-c", script], { maxBuffer: 20_000_000 }, (_err, stdout) => {
      if (_err) {
        console.log("  Parse error:", _err.message);
        resolve([]);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve([]);
      }
    });
    child.stdin?.write(html);
    child.stdin?.end();
  });
}

function parseDetailPage(html: string): Promise<DetailResult | null> {
  const script = String.raw`
import json, sys, re

html = sys.stdin.read()
result = {"images": [], "price": "", "original_price": "", "skus": []}

# Extract pictures from embedded JSON: "pictures":[{...}]
pics_m = re.search(r'"pictures":\[(.*?)\]', html)
if pics_m:
    try:
        pics = json.loads("[" + pics_m.group(1) + "]")
        # Find gallery template
        tmpl_m = re.search(r'"template":"(https:[^"]*\{id\}[^"]*)"', html)
        template = ""
        if tmpl_m:
            template = tmpl_m.group(1).replace(r'\u002F', '/')

        for pic in pics:
            pid = pic.get("id", "")
            sanitized = pic.get("sanitized_title", "")
            if template and pid:
                url = template.replace("{id}", pid).replace("{sanitizedTitle}", sanitized)
                result["images"].append(url)
            elif pid:
                # Fallback: construct URL directly
                result["images"].append(f"https://http2.mlstatic.com/D_NQ_NP_{pid}-F{sanitized}.webp")
    except Exception:
        pass

# If no pictures from JSON, try finding image URLs directly
if not result["images"]:
    img_urls = re.findall(r'https://http2\.mlstatic\.com/D_NQ_NP_2X_[^"]+\.webp', html)
    result["images"] = list(dict.fromkeys(img_urls))[:20]

# Extract price from JSON
price_m = re.search(r'"price":\{"(?:component_id[^}]*,)?"type":"price","value":(\d+(?:\.\d+)?)', html)
if not price_m:
    price_m = re.search(r'"price":\{[^}]*"value":(\d+(?:\.\d+)?)', html)
if price_m:
    val = float(price_m.group(1))
    result["price"] = f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

# Original price
orig_m = re.search(r'"original_value":(\d+(?:\.\d+)?)', html)
if orig_m:
    val = float(orig_m.group(1))
    result["original_price"] = f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

# Extract SKU variations
# Look for picker/variation data
# MeLi uses "variations" in embedded state or "picker" components
var_blocks = re.findall(r'"label":\{"text":"([^"]+)"[^}]*\}[^}]*"price":\{[^}]*"value":(\d+(?:\.\d+)?)', html)
seen_skus = set()
for label, price_val in var_blocks:
    key = f"{label}:{price_val}"
    if key not in seen_skus:
        seen_skus.add(key)
        val = float(price_val)
        price_str = f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        result["skus"].append({"name": label, "price": price_str})

# Also look for attribute-based variations
attr_blocks = re.findall(r'"attribute_combinations":\[(\{[^]]+)\]', html)
for attr_block in attr_blocks[:10]:
    try:
        attrs = json.loads("[" + attr_block + "]")
        for attr in attrs:
            name = attr.get("value_name", "")
            if name and name not in seen_skus:
                seen_skus.add(name)
                result["skus"].append({"name": name, "price": ""})
    except Exception:
        pass

print(json.dumps(result, ensure_ascii=False))
`;
  return new Promise((resolve) => {
    const child = execFile("python3", ["-c", script], { maxBuffer: 20_000_000 }, (_err, stdout) => {
      if (_err) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
    child.stdin?.write(html);
    child.stdin?.end();
  });
}

// ── Query generation ──

const VARIANT_SUFFIXES = ["-profissional", "-bateria"];

function buildQueries(keyword: string): string[] {
  const base = keyword.trim().replace(/\s+/g, "-");
  const queries = [base];
  for (const suffix of VARIANT_SUFFIXES) {
    queries.push(base + suffix);
  }
  return queries;
}

// ── Dedup helpers ──

function deduplicateSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((p) => {
    const isTrackingLink = !p.link || p.link.includes("click1.mercadolivre");
    const key = isTrackingLink ? p.name.toLowerCase().trim() : p.link;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    const nameKey = p.name.toLowerCase().trim();
    if (seen.has(nameKey)) {
      return false;
    }
    seen.add(nameKey);
    return true;
  });
}

// ── Map to RawProduct ──

function toRawProduct(item: SearchResult, detail: DetailResult | null): RawProduct {
  if (detail) {
    return {
      name: item.name,
      price: detail.price || item.price,
      original_price: detail.original_price || undefined,
      rating: item.rating || undefined,
      reviews: item.reviews || undefined,
      sold: item.sold || undefined,
      images: detail.images.length > 0 ? detail.images : item.image ? [item.image] : [],
      link: item.link,
      skus: detail.skus.map((s) => ({
        name: s.name,
        price: s.price || undefined,
      })),
      source: "meli",
    };
  }

  return {
    name: item.name,
    price: item.price,
    original_price: undefined,
    rating: item.rating || undefined,
    reviews: item.reviews || undefined,
    sold: item.sold || undefined,
    images: item.image ? [item.image] : [],
    link: item.link,
    skus: [],
    source: "meli",
  };
}

// ── Module export ──

export const meli: CrawlerModule = {
  name: "meli",

  crawl: async (opts: CrawlOptions): Promise<RawProduct[]> => {
    const queries = buildQueries(opts.keyword);

    // ── Phase 1: Search pages ──
    console.log("[meli] Phase 1: Search pages");
    const searchResults: SearchResult[] = [];

    for (const query of queries) {
      for (let offset = 0; offset < 200; offset += 50) {
        const url =
          offset === 0
            ? `https://lista.mercadolivre.com.br/${query}_OrderId_PRICE*QUANTITY_DESC`
            : `https://lista.mercadolivre.com.br/${query}_Desde_${offset + 1}_OrderId_PRICE*QUANTITY_DESC`;
        console.log(`[meli] "${query}" offset ${offset}...`);
        try {
          const html = await curlFetch(url);
          const products = await parseSearchResults(html);
          console.log(
            `  Found ${products.length} products (total: ${searchResults.length + products.length})`,
          );
          searchResults.push(...products);
          await sleep(1500);
        } catch (e: unknown) {
          console.log(`  Error: ${String(e)}`);
        }
      }
      // Early exit if we have enough raw results
      if (searchResults.length >= opts.maxProducts * 5) {
        break;
      }
    }

    const unique = deduplicateSearchResults(searchResults);
    const targets = unique.slice(0, opts.maxProducts);
    console.log(`[meli] Phase 1 done: ${targets.length} unique products`);

    // ── Phase 2: Detail pages ──
    console.log("[meli] Phase 2: Detail pages");
    const results: RawProduct[] = [];
    let detailOk = 0;
    let detailFail = 0;

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];

      if (!item.link || item.link.includes("click1.mercadolivre")) {
        results.push(toRawProduct(item, null));
        continue;
      }

      const cleanUrl = item.link.split("#")[0].split("?")[0];

      try {
        const html = await curlFetch(cleanUrl);

        if (html.length < 10000) {
          results.push(toRawProduct(item, null));
          detailFail++;
          continue;
        }

        const detail = await parseDetailPage(html);
        if (detail) {
          results.push(toRawProduct(item, detail));
          detailOk++;
          if ((i + 1) % 20 === 0 || i === targets.length - 1) {
            console.log(
              `  [${i + 1}/${targets.length}] ${detailOk} ok, ${detailFail} fail | last: ${detail.images.length} imgs, ${detail.skus.length} skus`,
            );
          }
        } else {
          results.push(toRawProduct(item, null));
          detailFail++;
        }
      } catch {
        results.push(toRawProduct(item, null));
        detailFail++;
      }

      await sleep(2000);
    }

    console.log(
      `[meli] Done: ${results.length} products | ${detailOk} detail ok, ${detailFail} detail fail`,
    );

    return results;
  },
};
