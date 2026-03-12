# Platform Anti-Bot & Technical Notes

## Amazon Brazil (amazon-br)

- **Search pages**: curl works fine with standard headers (User-Agent, Accept-Language pt-BR)
- **Detail pages**: curl returns "Não foi possível encontrar esta página" — must use Camoufox headless browser
- **Cookie jar**: Needed for session continuity across pages
- **Rate limiting**: 2s delay between search pages, 1s between detail pages in Camoufox
- **Image extraction**: `data-a-dynamic-image` JSON on `img#landingImage`, plus `#altImages` thumbnails
- **SKU variants**: `#twister` area for color/size, `dimensionValuesDisplayData` JSON in page source
- **Bandwidth**: Block images/fonts/stylesheets/tracking in Camoufox `page.route()` to save ~60-70%
- **Batch size**: Process detail pages in batches of 50 ASINs to avoid long browser sessions

## Mercado Livre (meli)

- **Search pages**: curl works, use `lista.mercadolivre.com.br/<keyword>` URL format
- **Detail pages**: curl works (no anti-bot on product pages)
- **Pagination**: `_Desde_<offset+1>` URL parameter, 50 results per page
- **Sort order**: `_OrderId_PRICE*QUANTITY_DESC` for best-selling first
- **Image extraction**: `"pictures"` JSON array embedded in HTML, gallery template URL pattern
- **SKU variants**: `"label"/"text"` + `"price"/"value"` pairs in embedded JSON
- **Price format**: `andes-money-amount__fraction` + `andes-money-amount__cents` CSS classes
- **API**: Returns 403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` — requires auth, cannot be used
- **Tracking links**: Some search results have `click1.mercadolivre` redirect URLs instead of direct product links — dedup by name for these

## Adding New Platforms

To add a new platform crawler:

1. Create `scripts/crawlers/<platform-id>.ts`
2. Implement the `CrawlerModule` interface from `./types.ts`
3. Register in `scripts/crawl.ts` `crawlerRegistry`
4. Add notes to this file

```typescript
import type { CrawlerModule, CrawlOptions, RawProduct } from "./types.ts";

export const myPlatform: CrawlerModule = {
  name: "my-platform",
  crawl: async (opts: CrawlOptions): Promise<RawProduct[]> => {
    // Phase 1: Search pages
    // Phase 2: Detail pages (if needed)
    // Return standardized RawProduct[]
  },
};
```
