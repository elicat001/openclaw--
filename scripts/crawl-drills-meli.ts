#!/usr/bin/env bun
/**
 * Crawl top electric drills from Mercado Livre Brazil with name, price, rating, link, image, sold
 */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";

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

type MeliProduct = {
  name: string;
  price: string;
  rating: string;
  reviews: string;
  sold: string;
  image: string;
  link: string;
};

function parseProducts(html: string): Promise<MeliProduct[]> {
  const script = String.raw`
import json, sys, re

html = sys.stdin.read()
products = []

# Mercado Livre uses ui-search-layout items
# Split by product card sections
blocks = re.split(r'<li[^>]*class="[^"]*ui-search-layout__item[^"]*"', html)

for block in blocks[1:]:
    # Name from title
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

    # Price
    price = ""
    price_m = re.search(r'class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>(\d[\d.]*)', block)
    if price_m:
        price = f"R$ {price_m.group(1)}"
        cents_m = re.search(r'class="[^"]*andes-money-amount__cents[^"]*"[^>]*>(\d+)', block)
        if cents_m:
            price += f",{cents_m.group(1)}"

    # Rating
    rating = ""
    rating_m = re.search(r'class="[^"]*poly-reviews__rating[^"]*"[^>]*>([\d,.]+)', block)
    if not rating_m:
        rating_m = re.search(r'aria-label="([0-9,.]+)\s+de\s+5', block)
    if rating_m:
        rating = rating_m.group(1)

    # Reviews count
    reviews = ""
    rev_m = re.search(r'class="[^"]*poly-reviews__total[^"]*"[^>]*>\(?(\d[\d.]*)', block)
    if rev_m:
        reviews = rev_m.group(1)

    # Sold count
    sold = ""
    sold_m = re.search(r'(\d[\d.]*\+?\s*vendido)', block)
    if sold_m:
        sold = sold_m.group(1)

    # Image
    image = ""
    img_m = re.search(r'<img[^>]*(?:data-src|src)="(https://[^"]*meli[^"]*\.(?:jpg|png|webp)[^"]*)"', block)
    if not img_m:
        img_m = re.search(r'<img[^>]*(?:data-src|src)="(https://http2\.mlstatic\.com[^"]*)"', block)
    if img_m:
        image = img_m.group(1)

    # Link
    link = ""
    link_m = re.search(r'href="(https://[^"]*mercadolivre[^"]*MLB[^"]*)"', block)
    if not link_m:
        link_m = re.search(r'href="(https://[^"]*mlb[^"]*)"', block, re.I)
    if not link_m:
        link_m = re.search(r'href="(https://(?:produto|www)\.mercadolivre\.com\.br[^"]*)"', block)
    if link_m:
        link = link_m.group(1).split('?')[0]  # clean tracking params

    products.append({
        "name": name, "price": price, "rating": rating,
        "reviews": reviews, "sold": sold, "image": image, "link": link,
    })

print(json.dumps(products, ensure_ascii=False))
`;
  return new Promise((resolve) => {
    const child = execFile("python3", ["-c", script], { maxBuffer: 20_000_000 }, (err, stdout) => {
      if (err) {
        console.log("  Parse error:", err.message);
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
  const all: MeliProduct[] = [];

  // Mercado Livre: sorted by best sellers (_OrderId_PRICE*QUANTITY_DESC or relevance)
  // Pagination: Desde_51, Desde_101, etc.
  for (let offset = 0; offset < 350; offset += 50) {
    const url =
      offset === 0
        ? "https://lista.mercadolivre.com.br/furadeira-eletrica_OrderId_PRICE*QUANTITY_DESC"
        : `https://lista.mercadolivre.com.br/furadeira-eletrica_Desde_${offset + 1}_OrderId_PRICE*QUANTITY_DESC`;
    console.log(`[MeLi] Offset ${offset}...`);
    try {
      const html = await curlFetch(url);
      const products = await parseProducts(html);
      console.log(`  Found ${products.length} products (total: ${all.length + products.length})`);
      all.push(...products);
      if (all.length >= 300) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e: unknown) {
      console.log(`  Error: ${String(e)}`);
    }
  }

  // Dedup by link
  const seen = new Set<string>();
  const unique = all.filter((p) => {
    const key = p.link || p.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  writeFileSync("/tmp/meli-drills.json", JSON.stringify(unique.slice(0, 300), null, 2));
  console.log(`[MeLi] Done: ${unique.length} unique products saved`);
}

main().catch(console.error);
