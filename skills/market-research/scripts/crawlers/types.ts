/**
 * Shared types for market research crawlers.
 * Each platform crawler implements the CrawlerModule interface.
 */

export type CrawlOptions = {
  keyword: string;
  maxProducts: number;
  country: string;
  proxy?: string;
};

export type RawProduct = {
  name: string;
  price: string;
  original_price?: string;
  rating?: string;
  reviews?: string;
  sold?: string;
  images: string[];
  link: string;
  skus: Array<{ name: string; price?: string; id?: string }>;
  source: string;
  /** Platform-specific fields preserved for downstream processing */
  raw?: Record<string, unknown>;
};

export type CrawlerModule = {
  name: string;
  crawl: (opts: CrawlOptions) => Promise<RawProduct[]>;
};
