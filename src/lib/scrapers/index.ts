// ============================================================================
// PRICE SCRAPER PIPELINE — Public API
// ============================================================================

export { runScraperPipeline } from './pipeline'
export type { DeviceToScrape, ScrapedPrice, ScraperResult, IPriceScraper } from './types'
export { scrapeGoRecell } from './adapters/gorecell'
export { scrapeTelus } from './adapters/telus'
export { scrapeBell } from './adapters/bell'
export { scrapeApple } from './adapters/apple'
