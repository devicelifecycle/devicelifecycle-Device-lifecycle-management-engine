import { scrapeTelusFullCatalog } from '../src/lib/scrapers/adapters/telus'

async function main() {
  const result = await scrapeTelusFullCatalog()
  
  console.log('Total prices:', result.prices.length)
  console.log('Success:', result.success)
  console.log('Error:', result.error || 'none')
  
  const models = new Set(result.prices.map(p => p.model))
  console.log('\nUnique models:', models.size)
  
  const arr = Array.from(models).sort()
  console.log('\nAll models:')
  for (const m of arr) {
    console.log('  -', m)
  }
}

main().catch(console.error)
