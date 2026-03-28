import { getAppleScraperImpl } from './adapters/apple-scrapling'
import { getBellScraperImpl } from './adapters/bell-scrapling'
import { getGoRecellScraperImpl } from './adapters/gorecell-scrapling'
import { getTelusScraperImpl } from './adapters/telus-scrapling'
import { getUniverCellScraperImpl } from './adapters/universal-scrapling'

export type ScraperProviderId = 'apple' | 'bell' | 'gorecell' | 'telus' | 'univercell'
export type ScraperConfiguredImpl = 'ts' | 'scrapling' | 'dual'
export type ScraperPersistedImpl = 'ts' | 'scrapling'

export type ScraperProviderMetadata = {
  id: ScraperProviderId
  name: string
  envKey: string
  settingsPrefix: string
  getConfiguredImpl: () => ScraperConfiguredImpl
}

export const SCRAPER_PROVIDERS: ScraperProviderMetadata[] = [
  {
    id: 'apple',
    name: 'Apple Trade-In',
    envKey: 'SCRAPER_APPLE_IMPL',
    settingsPrefix: 'apple',
    getConfiguredImpl: getAppleScraperImpl,
  },
  {
    id: 'bell',
    name: 'Bell',
    envKey: 'SCRAPER_BELL_IMPL',
    settingsPrefix: 'bell',
    getConfiguredImpl: getBellScraperImpl,
  },
  {
    id: 'gorecell',
    name: 'GoRecell',
    envKey: 'SCRAPER_GORECELL_IMPL',
    settingsPrefix: 'gorecell',
    getConfiguredImpl: getGoRecellScraperImpl,
  },
  {
    id: 'telus',
    name: 'Telus',
    envKey: 'SCRAPER_TELUS_IMPL',
    settingsPrefix: 'telus',
    getConfiguredImpl: getTelusScraperImpl,
  },
  {
    id: 'univercell',
    name: 'UniverCell',
    envKey: 'SCRAPER_UNIVERCELL_IMPL',
    settingsPrefix: 'universal',
    getConfiguredImpl: getUniverCellScraperImpl,
  },
]

export function getConfiguredScraperImplementation(providerId: ScraperProviderId): ScraperConfiguredImpl {
  return SCRAPER_PROVIDERS.find((provider) => provider.id === providerId)?.getConfiguredImpl() || 'ts'
}

export function getPersistedScraperImplementation(providerId: ScraperProviderId): ScraperPersistedImpl {
  const configured = getConfiguredScraperImplementation(providerId)
  return configured === 'scrapling' ? 'scrapling' : 'ts'
}

export function getProviderSettingsKeys(prefix: string): string[] {
  return [
    `last_${prefix}_scraper_at`,
    `last_${prefix}_scraper_status`,
    `last_${prefix}_scraper_count`,
    `last_${prefix}_scraper_duration_ms`,
    `last_${prefix}_scraper_configured_impl`,
    `last_${prefix}_scraper_persisted_impl`,
    `last_${prefix}_scraper_error`,
  ]
}
