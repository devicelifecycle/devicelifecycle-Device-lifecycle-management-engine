-- Speed up post-scrape stale-row cleanup without touching manual entries.
-- Used by runPostScrapeCleanup: source != 'manual' AND scraped_at < cutoff.

CREATE INDEX IF NOT EXISTS idx_competitor_prices_stale_cleanup
  ON competitor_prices (scraped_at)
  WHERE source IS DISTINCT FROM 'manual' AND scraped_at IS NOT NULL;
