// Debug UniverCell API calls with new action IDs
import { fetchWithRetry } from '../src/lib/scrapers/utils'

const UNIVERCELL_ACTION_URL = 'https://univercell.ai/sell/details/mobile'
const ACTION_GET_DEVICE_TYPES = '002d8f7ec727c08e299f84b04d3b412735ede54700'
const ACTION_GET_MAKES = '40748246c8bd4b73125db4804f15b18c543b2d4ed4'
const ACTION_GET_MODELS = '60268b8459b6bb79ac082b14589c9a110e3eb43da1'

function parseActionArray<T>(text: string): T[] | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const payload = line.slice(separator + 1)
    if (!payload.startsWith('[')) continue
    try {
      const parsed = JSON.parse(payload)
      if (Array.isArray(parsed)) return parsed as T[]
    } catch {
      continue
    }
  }

  return null
}

async function testAction(name: string, actionId: string, args: unknown[]) {
  console.log(`\n📡 Testing ${name}...`)
  console.log(`   Action ID: ${actionId}`)
  console.log(`   Args: ${JSON.stringify(args)}`)
  
  try {
    const response = await fetch(UNIVERCELL_ACTION_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify(args),
    })

    console.log(`   Status: ${response.status}`)
    console.log(`   Content-Type: ${response.headers.get('content-type')}`)
    
    const body = await response.text()
    console.log(`   Body length: ${body.length}`)
    console.log(`   Body preview: ${body.slice(0, 500)}`)
    
    const parsed = parseActionArray(body)
    if (parsed) {
      console.log(`   ✅ Parsed ${parsed.length} items`)
      console.log(`   First item: ${JSON.stringify(parsed[0], null, 2)}`)
    } else {
      console.log(`   ❌ Could not parse response`)
    }
    
    return parsed
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function main() {
  console.log('🔍 Testing UniverCell Server Actions with new IDs...\n')
  
  // Test device types
  const types = await testAction('getDeviceTypes', ACTION_GET_DEVICE_TYPES, [])
  
  if (types && types.length > 0) {
    // Find mobile type
    const mobileType = types.find((t: any) => t.id === 'mobile' || t.name?.toLowerCase().includes('mobile'))
    
    if (mobileType) {
      console.log(`\n   Found mobile type: ${JSON.stringify(mobileType)}`)
      
      // Test makes for mobile
      const makes = await testAction('getMakes', ACTION_GET_MAKES, [(mobileType as any).id || 'mobile'])
      
      if (makes && makes.length > 0) {
        // Find Apple
        const apple = makes.find((m: any) => m.name?.toLowerCase().includes('apple'))
        
        if (apple) {
          console.log(`\n   Found Apple make: ${JSON.stringify(apple)}`)
          
          // Get mobile type's rd_id
          const rdId = (mobileType as any).rd_id
          const rbId = (apple as any).rb_id
          
          if (rdId && rbId) {
            // Test models
            await testAction('getModels', ACTION_GET_MODELS, [rbId, rdId])
          } else {
            console.log(`   ❌ Missing rd_id (${rdId}) or rb_id (${rbId})`)
          }
        }
      }
    }
  }
  
  console.log('\n✅ Done!')
}

main().catch(console.error)
