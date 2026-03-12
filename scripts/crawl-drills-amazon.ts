#!/usr/bin/env bun
/**
 * Crawl top electric drills from Amazon Brazil with name, price, rating, link, image
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

type AmazonProduct = {
  asin: string;
  name: string;
  price: string;
  rating: string;
  reviews: string;
  image: string;
  sold: string;
  link: string;
};

function parseProducts(html: string): Promise<AmazonProduct[]> {
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

    # Name
    name_m = re.search(r'<h2[^>]*>.*?<span[^>]*>(.*?)</span>', block, re.DOTALL)
    if not name_m:
        continue
    name = name_m.group(1).strip()
    name = name.replace('&amp;', '&').replace('&#39;', "'").replace('&quot;', '"')
    if len(name) < 5 or 'resultados para' in name:
        continue

    # Price
    price = ""
    price_m = re.search(r'a-price-whole">(\d+)', block)
    if price_m:
        frac_m = re.search(r'a-price-fraction">(\d+)', block)
        price = f"R$ {price_m.group(1)}"
        if frac_m:
            price += f",{frac_m.group(1)}"

    # Rating
    rating = ""
    rating_m = re.search(r'a-icon-alt">([0-9,]+)\s+de\s+5', block)
    if rating_m:
        rating = rating_m.group(1)

    # Reviews
    reviews = ""
    rev_m = re.search(r'<span[^>]*class="[^"]*s-underline-text[^"]*"[^>]*>([\d.]+)', block)
    if rev_m:
        reviews = rev_m.group(1)

    # Image
    image = ""
    img_m = re.search(r'<img[^>]*class="s-image"[^>]*src="([^"]+)"', block)
    if img_m:
        image = img_m.group(1)

    # Sales info
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

async function main() {
  const all: AmazonProduct[] = [];
  // Warmup
  console.log("[Amazon] Warming up...");
  await curlFetch("https://www.amazon.com.br/").catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  // Sort by best sellers (relevance is default, which Amazon sorts by popularity)
  for (let page = 1; page <= 8; page++) {
    const url = `https://www.amazon.com.br/s?k=furadeira+eletrica&page=${page}`;
    console.log(`[Amazon] Page ${page}...`);
    try {
      const html = await curlFetch(url);
      const products = await parseProducts(html);
      console.log(`  Found ${products.length} products (total: ${all.length + products.length})`);
      all.push(...products);
      if (all.length >= 300) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e: unknown) {
      console.log(`  Error: ${String(e)}`);
    }
  }

  // Dedup
  const seen = new Set<string>();
  const unique = all.filter((p) => {
    if (seen.has(p.asin)) {
      return false;
    }
    seen.add(p.asin);
    return true;
  });

  writeFileSync("/tmp/amazon-drills.json", JSON.stringify(unique.slice(0, 300), null, 2));
  console.log(`[Amazon] Done: ${unique.length} unique products saved`);
}

main().catch(console.error);
