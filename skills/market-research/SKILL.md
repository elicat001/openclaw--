---
name: market-research
description: "电商市场调研工具：爬取产品数据、清洗、生成深度分析报告、跨市场选品机会分析。支持 Amazon US / Amazon BR / Mercado Livre，任意品类关键词。触发：市场调研、竞品分析、选品分析、crawl products、market research、product research、cross-market、选品机会。"
metadata: { "openclaw": { "emoji": "📊", "requires": { "bins": ["python3"] } } }
---

# Market Research

Crawl product data from e-commerce platforms, clean it, and generate deep analysis reports for product selection decisions.

## Supported Platforms

- **amazon-us** — Amazon US (curl + Camoufox headless browser) — for cross-market comparison
- **amazon-br** — Amazon Brazil (curl + Camoufox headless browser)
- **meli** — Mercado Livre Brazil (curl)

## Quick Start

### Full pipeline (crawl → clean → analyze)

```bash
pnpm tsx {baseDir}/scripts/crawl.ts --keyword "furadeira eletrica" --pipeline full
```

### Cross-market product selection (recommended)

```bash
# Crawl US + BR markets, run full pipeline including opportunity analysis
pnpm tsx {baseDir}/scripts/crawl.ts \
  --keyword "cordless drill" \
  --platforms amazon-us,amazon-br,meli \
  --pipeline full
```

### Step-by-step

```bash
# Step 1: Crawl product data
pnpm tsx {baseDir}/scripts/crawl.ts --keyword "fone bluetooth" --platforms amazon-br,meli --max 200

# Step 2: Clean and enrich data
pnpm tsx {baseDir}/scripts/clean.ts --input /tmp/market-research-fone-bluetooth/ --brands auto

# Step 3: Generate analysis report
pnpm tsx {baseDir}/scripts/analyze.ts --input /tmp/market-research-fone-bluetooth/cleaned.json --output report.md

# Step 4 (optional): Cross-market opportunity analysis
pnpm tsx {baseDir}/scripts/opportunity.ts \
  --us-data /tmp/market-research-cordless-drill/amazon-us.json \
  --br-data /tmp/market-research-fone-bluetooth/ \
  --output opportunity-report.md
```

## crawl.ts Options

| Flag                  | Description                                           | Default                        |
| :-------------------- | :---------------------------------------------------- | :----------------------------- |
| `--keyword <text>`    | Search keyword (required)                             | —                              |
| `--platforms <list>`  | Comma-separated platform IDs                          | `amazon-br,meli`               |
| `--max <n>`           | Max products per platform                             | `300`                          |
| `--output-dir <path>` | Output directory                                      | `/tmp/market-research-<slug>/` |
| `--pipeline <stage>`  | `crawl`, `clean`, `analyze`, `opportunity`, or `full` | `crawl`                        |
| `--country <code>`    | Country code                                          | `br`                           |

## clean.ts Options

| Flag                  | Description                                      | Default                |
| :-------------------- | :----------------------------------------------- | :--------------------- |
| `--input <dir>`       | Directory with crawled JSON files                | required               |
| `--brands <category>` | `drills`, `auto` (generic first-word extraction) | `auto`                 |
| `--output <file>`     | Cleaned JSON output path                         | `<input>/cleaned.json` |

## analyze.ts Options

| Flag              | Description            | Default                       |
| :---------------- | :--------------------- | :---------------------------- |
| `--input <file>`  | Path to cleaned JSON   | required                      |
| `--output <file>` | Markdown report output | `./market-analysis-report.md` |

## opportunity.ts Options

| Flag               | Description                      | Default                           |
| :----------------- | :------------------------------- | :-------------------------------- |
| `--us-data <file>` | Path to amazon-us.json           | required                          |
| `--br-data <dir>`  | Directory with BR platform JSONs | required                          |
| `--output <file>`  | Opportunity report output        | `<br-data>/opportunity-report.md` |

### Selection Strategies

- **Strategy A: US Hot × BR Blank** — US products with 500+ reviews and 4.0+ rating, cross-referenced against Brazil market presence. Products with no BR competitors are blue ocean opportunities.
- **Strategy B: BR Slow × Price Gap** — BR products with <20 reviews priced above 75th percentile, analyzed for price reduction + margin opportunity using cost estimation.

## cost.ts (Module)

Cost estimation for cross-border e-commerce (China → Brazil). Used by opportunity.ts.

- Factory cost: supply-chain-origin heuristic (20% for Chinese OEM, 50% for international brands)
- Shipping: R$8/kg sea freight average
- Import duty: 60% (ICMS + II)
- FBA: weight-based tier pricing (R$15.9–R$55.9)
- Platform commission: 16%
- **1688 calibration interface**: reserved for future real wholesale price data

## Analysis Dimensions

The report includes 9 analysis sections:

1. **Market Overview** — platform comparison, pricing summary, product types
2. **Price Analysis** — distribution histogram, price tiers, platform gap, discounts
3. **Brand Competition** — market share, price×rating quadrant, SKU richness
4. **Product Features** — voltage, wattage, chuck size, accessories impact
5. **Image Quality** — image count vs ratings correlation
6. **Supply Chain** — Chinese/global/local brand breakdown, OEM patterns
7. **FBA & Logistics** — weight-based cost estimation, self-ship vs FBA
8. **Seasonality** — Brazil market calendar, key promotional dates
9. **Selection Matrix** — blue ocean opportunities, recommended product profiles

## Brand Libraries

Available brand libraries for `--brands`:

- `drills` — 40+ electric drill brands (Bosch, DeWalt, Makita, etc.)
- `auto` — generic global brands + first-word extraction heuristic

To add a new category, create `scripts/brands/<category>.ts` and register in `scripts/brands/index.ts`.

## Output

- **Crawled JSON**: `<output-dir>/<platform>.json` — raw product data per platform
- **Cleaned JSON**: `<output-dir>/cleaned.json` — enriched with brand, type, pricing metadata
- **Analysis Report**: Markdown with ASCII charts, tables, and actionable recommendations

## Notes

- Amazon BR detail pages require **Camoufox** (headless anti-detect browser). Install: `pip install camoufox && python -m camoufox fetch`
- Crawling respects rate limits (1-2s delays between requests)
- Bandwidth: ~0.5-1 GB total for 300 products × 2 platforms (images blocked in Camoufox)
- For residential proxy billing, expect ~$2-4 per full crawl run
