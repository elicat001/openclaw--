#!/usr/bin/env bun
/**
 * Crawl top electric drills from Amazon Brazil.
 * Phase 1: Search pages (curl) → collect ASINs
 * Phase 2: Detail pages (Camoufox headless browser) → extract all images + SKU variants
 */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";

const COOKIE_JAR = "/tmp/amazon-br-drill-cookies.txt";

function curlFetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-s",
        "-L",
        "--max-time",
        "30",
        "-b",
        COOKIE_JAR,
        "-c",
        COOKIE_JAR,
        "-H",
        "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "-H",
        "Accept: text/html,application/xhtml+xml",
        "-H",
        "Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8",
        "-H",
        "Accept-Encoding: gzip, deflate, br",
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

type AmazonSku = {
  name: string;
  price: string;
  asin: string;
};

type AmazonProduct = {
  asin: string;
  name: string;
  price: string;
  rating: string;
  reviews: string;
  images: string[];
  sold: string;
  link: string;
  skus: AmazonSku[];
};

type SearchResult = {
  asin: string;
  name: string;
  price: string;
  rating: string;
  reviews: string;
  image: string;
  sold: string;
  link: string;
};

function parseSearchResults(html: string): Promise<SearchResult[]> {
  const script = String.raw`
import json, sys, re

html = sys.stdin.read()
products = []
parts = re.split(r'data-asin="([A-Z0-9]{10})"', html)

for i in range(1, len(parts), 2):
    asin = parts[i]
    block = parts[i+1] if i+1 < len(parts) else ""
    if len(block) < 500:
        continue

    name_m = re.search(r'<h2[^>]*>.*?<span[^>]*>(.*?)</span>', block, re.DOTALL)
    if not name_m:
        continue
    name = name_m.group(1).strip()
    name = name.replace('&amp;', '&').replace('&#39;', "'").replace('&quot;', '"')
    if len(name) < 5 or 'resultados para' in name:
        continue

    price = ""
    price_m = re.search(r'a-price-whole">(\d+)', block)
    if price_m:
        frac_m = re.search(r'a-price-fraction">(\d+)', block)
        price = f"R$ {price_m.group(1)}"
        if frac_m:
            price += f",{frac_m.group(1)}"

    rating = ""
    rating_m = re.search(r'a-icon-alt">([0-9,]+)\s+de\s+5', block)
    if rating_m:
        rating = rating_m.group(1)

    reviews = ""
    rev_m = re.search(r'<span[^>]*class="[^"]*s-underline-text[^"]*"[^>]*>([\d.]+)', block)
    if rev_m:
        reviews = rev_m.group(1)

    image = ""
    img_m = re.search(r'<img[^>]*class="s-image"[^>]*src="([^"]+)"', block)
    if img_m:
        image = img_m.group(1)

    sold = ""
    sold_m = re.search(r'(\d[\d.]*\s*(?:mil)?\s*comprado)', block)
    if sold_m:
        sold = sold_m.group(1)

    link = f"https://www.amazon.com.br/dp/{asin}"
    products.append({
        "asin": asin, "name": name, "price": price,
        "rating": rating, "reviews": reviews, "image": image,
        "sold": sold, "link": link,
    })

seen = set()
unique = []
for p in products:
    if p["asin"] not in seen:
        seen.add(p["asin"])
        unique.append(p)
print(json.dumps(unique, ensure_ascii=False))
`;
  return new Promise((resolve) => {
    const child = execFile("python3", ["-c", script], { maxBuffer: 20_000_000 }, (err, stdout) => {
      if (err) {
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

/**
 * Use Camoufox to fetch detail pages in batch and extract images + SKU variants.
 * Processes ASINs in batches to avoid keeping browser open too long.
 */
function fetchDetailsBatch(
  asins: string[],
): Promise<Record<string, { images: string[]; skus: AmazonSku[] }>> {
  const script = String.raw`
import json, sys, time, re, warnings
warnings.filterwarnings("ignore")

asins = json.loads(sys.stdin.read())
results = {}

from camoufox.sync_api import Camoufox

with Camoufox(headless=True, humanize=True) as browser:
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        locale="pt-BR",
    )
    page = context.new_page()

    for idx, asin in enumerate(asins):
        url = f"https://www.amazon.com.br/dp/{asin}"
        try:
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            time.sleep(2)

            html = page.content()

            # Extract images
            images = []

            # Method 1: data-a-dynamic-image JSON on main image
            img_el = page.query_selector("img#landingImage")
            if img_el:
                dyn = img_el.get_attribute("data-a-dynamic-image")
                if dyn:
                    try:
                        img_dict = json.loads(dyn)
                        # Get unique image IDs (different sizes of same image)
                        seen_ids = set()
                        for img_url in img_dict.keys():
                            # Extract image ID like "71Pzlfet1jL"
                            id_m = re.search(r'/images/I/([^.]+)', img_url)
                            if id_m:
                                img_id = id_m.group(1)
                                base_id = re.sub(r'\._[^.]+$', '', img_id)
                                if base_id not in seen_ids:
                                    seen_ids.add(base_id)
                                    # Use high-res version
                                    images.append(f"https://m.media-amazon.com/images/I/{base_id}._AC_SL1500_.jpg")
                    except Exception:
                        pass

            # Method 2: alt image thumbnails
            thumbs = page.query_selector_all("li.imageThumbnail img, #altImages img")
            thumb_ids = set()
            for thumb in thumbs:
                src = thumb.get_attribute("src") or ""
                id_m = re.search(r'/images/I/([^.]+)', src)
                if id_m:
                    img_id = id_m.group(1)
                    base_id = re.sub(r'\._[^.]+$', '', img_id)
                    if base_id not in thumb_ids and base_id not in {re.sub(r'\._[^.]+$', '', re.search(r'/images/I/([^.]+)', u).group(1)) if re.search(r'/images/I/([^.]+)', u) else '' for u in images}:
                        thumb_ids.add(base_id)
                        images.append(f"https://m.media-amazon.com/images/I/{base_id}._AC_SL1500_.jpg")

            # Method 3: fallback - find all image URLs in HTML
            if not images:
                img_ids = set()
                for m in re.finditer(r'https://m\.media-amazon\.com/images/I/([^."]+)', html):
                    base_id = re.sub(r'\._[^.]+$', '', m.group(1))
                    if len(base_id) > 5 and base_id not in img_ids:
                        img_ids.add(base_id)
                        images.append(f"https://m.media-amazon.com/images/I/{base_id}._AC_SL1500_.jpg")
                images = images[:20]

            # Extract SKU variants from #twister area
            skus = []
            # Color variants
            color_els = page.query_selector_all("#variation_color_name li, #twister .swatchAvailable")
            for el in color_els:
                title = el.get_attribute("title") or ""
                # "Clique para selecionar Amarelo"
                name_m = re.search(r'selecionar\s+(.+)', title)
                if not name_m:
                    name_m = re.search(r'(.+)', title)
                asin_attr = el.get_attribute("data-defaultasin") or el.get_attribute("data-asin") or ""
                if name_m and name_m.group(1).strip():
                    skus.append({"name": name_m.group(1).strip(), "price": "", "asin": asin_attr})

            # Size/option variants
            option_els = page.query_selector_all("#variation_size_name option, #twister select option")
            for el in option_els:
                text = el.inner_text().strip()
                if text and text != "Selecionar" and len(text) > 1:
                    skus.append({"name": text, "price": "", "asin": ""})

            # Button-style variants
            button_els = page.query_selector_all("#twister .a-button-text")
            for el in button_els:
                text = el.inner_text().strip()
                if text and len(text) > 1 and len(text) < 100:
                    skus.append({"name": text, "price": "", "asin": ""})

            # Inline variant JSON in page source
            var_m = re.search(r'"dimensionValuesDisplayData"\s*:\s*(\{[^}]+\})', html)
            if var_m:
                try:
                    dim_data = json.loads(var_m.group(1))
                    for var_asin, labels in dim_data.items():
                        if isinstance(labels, list) and labels:
                            name = " / ".join(str(l) for l in labels)
                            if not any(s["name"] == name for s in skus):
                                skus.append({"name": name, "price": "", "asin": var_asin})
                except Exception:
                    pass

            results[asin] = {"images": images[:20], "skus": skus[:30]}

            if (idx + 1) % 10 == 0:
                sys.stderr.write(f"  [{idx+1}/{len(asins)}] processed\n")
                sys.stderr.flush()

        except Exception as e:
            sys.stderr.write(f"  Error {asin}: {e}\n")
            sys.stderr.flush()
            results[asin] = {"images": [], "skus": []}

        time.sleep(1)

    context.close()

print(json.dumps(results, ensure_ascii=False))
`;
  return new Promise((resolve) => {
    const child = execFile(
      "python3",
      ["-c", script],
      { maxBuffer: 50_000_000, timeout: 1800_000 },
      (err, stdout, stderr) => {
        if (stderr) {
          process.stderr.write(stderr);
        }
        if (err) {
          console.log("  Camoufox batch error:", err.message);
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          console.log("  Failed to parse Camoufox output");
          resolve({});
        }
      },
    );
    child.stdin?.write(JSON.stringify(asins));
    child.stdin?.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // ── Phase 1: Collect ASINs from search pages ──
  console.log("═══ Phase 1: Search pages (curl) ═══\n");
  const searchResults: SearchResult[] = [];

  console.log("[Amazon] Warming up...");
  await curlFetch("https://www.amazon.com.br/").catch(() => {});
  await sleep(1500);

  for (let page = 1; page <= 8; page++) {
    const url = `https://www.amazon.com.br/s?k=furadeira+eletrica&page=${page}`;
    console.log(`[Amazon] Page ${page}...`);
    try {
      const html = await curlFetch(url);
      const products = await parseSearchResults(html);
      console.log(
        `  Found ${products.length} products (total: ${searchResults.length + products.length})`,
      );
      searchResults.push(...products);
      if (searchResults.length >= 300) {
        break;
      }
      await sleep(2000);
    } catch (e: unknown) {
      console.log(`  Error: ${String(e)}`);
    }
  }

  // Dedup
  const seen = new Set<string>();
  const uniqueSearch = searchResults.filter((p) => {
    if (seen.has(p.asin)) {
      return false;
    }
    seen.add(p.asin);
    return true;
  });

  const targets = uniqueSearch.slice(0, 300);
  console.log(`\nPhase 1 done: ${targets.length} unique ASINs\n`);

  // ── Phase 2: Fetch detail pages with Camoufox ──
  console.log("═══ Phase 2: Detail pages (Camoufox) ═══\n");

  const asins = targets.map((p) => p.asin);

  // Process in batches of 50 to avoid long browser sessions
  const BATCH_SIZE = 50;
  const allDetails: Record<string, { images: string[]; skus: AmazonSku[] }> = {};

  for (let i = 0; i < asins.length; i += BATCH_SIZE) {
    const batch = asins.slice(i, i + BATCH_SIZE);
    console.log(
      `[Amazon] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(asins.length / BATCH_SIZE)} (${batch.length} ASINs)...`,
    );
    const batchResults = await fetchDetailsBatch(batch);
    Object.assign(allDetails, batchResults);
    console.log(`  Batch done: ${Object.keys(batchResults).length} results`);
  }

  // Merge search results with detail data
  const results: AmazonProduct[] = targets.map((item) => {
    const detail = allDetails[item.asin];
    return {
      asin: item.asin,
      name: item.name,
      price: item.price,
      rating: item.rating,
      reviews: item.reviews,
      images: detail?.images.length ? detail.images : item.image ? [item.image] : [],
      sold: item.sold,
      link: item.link,
      skus: detail?.skus ?? [],
    };
  });

  writeFileSync("/tmp/amazon-drills.json", JSON.stringify(results, null, 2));
  const avgImages = results.reduce((s, p) => s + p.images.length, 0) / results.length;
  const withSkus = results.filter((p) => p.skus.length > 0).length;
  console.log(
    `\n[Amazon] Done: ${results.length} products | avg ${avgImages.toFixed(1)} images/product | ${withSkus} with SKUs`,
  );
}

main().catch(console.error);
