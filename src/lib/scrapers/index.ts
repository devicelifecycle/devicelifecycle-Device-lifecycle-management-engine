// ============================================================================
// PRICE SCRAPER PIPELINE — Public API
// ============================================================================

export { runScraperPipeline } from './pipeline'
export type { ScraperProviderId } from './pipeline'
export type { DeviceToScrape, ScrapedPrice, ScraperResult, IPriceScraper } from './types'
export { scrapeGoRecell, scrapeGoRecellFullCatalog } from './adapters/gorecell'
export { scrapeTelus, scrapeTelusFullCatalog } from './adapters/telus'
export { scrapeBell, scrapeBellFullCatalog } from './adapters/bell'
export { scrapeApple } from './adapters/apple'
export { scrapeUniversal, scrapeUniversalFullCatalog } from './adapters/universal'
