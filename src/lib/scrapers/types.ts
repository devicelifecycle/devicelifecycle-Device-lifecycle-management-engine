// ============================================================================
// PRICE SCRAPER PIPELINE TYPES
// ============================================================================

export interface DeviceToScrape {
  make: string
  model: string
  storage: string
  condition?: 'excellent' | 'good' | 'fair' | 'broken'
}

export interface ScrapedPrice {
  competitor_name: string
  make: string
  model: string
  storage: string
  trade_in_price: number | null
  sell_price?: number | null
  condition?: 'excellent' | 'good' | 'fair' | 'broken'
  scraped_at: string
  raw?: unknown
}

export interface ScraperResult {
  competitor_name: string
  prices: ScrapedPrice[]
  success: boolean
  error?: string
  duration_ms: number
}

export interface IPriceScraper {
  id: string
  name: string
  /** Scrape trade-in prices for given devices */
  scrape(devices: DeviceToScrape[]): Promise<ScraperResult>
}
