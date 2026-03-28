// ============================================================================
// Script to discover UniverCell Server Action IDs using Playwright
// Run: npx tsx scripts/discover-univercell-actions.ts
// ============================================================================

import { chromium } from '@playwright/test'

async function main() {
  console.log('🔍 Discovering UniverCell Server Action IDs...\n')
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  
  const actionCalls: Array<{ actionId: string; body: string; response: string }> = []
  
  // Intercept all requests and responses to capture Next-Action headers
  page.on('request', async (request) => {
    if (request.method() === 'POST' && request.url().includes('/sell/details/')) {
      const nextAction = request.headers()['next-action']
      if (nextAction) {
        const body = request.postData() || ''
        actionCalls.push({ actionId: nextAction, body, response: '' })
        console.log(`📤 Request - Action: ${nextAction}, Body: ${body.slice(0, 100)}`)
      }
    }
  })
  
  page.on('response', async (response) => {
    if (response.request().method() === 'POST' && response.url().includes('/sell/details/')) {
      const nextAction = response.request().headers()['next-action']
      if (nextAction) {
        try {
          const text = await response.text()
          const call = actionCalls.find(c => c.actionId === nextAction && !c.response)
          if (call) {
            call.response = text
          }
          console.log(`📥 Response - Action: ${nextAction}, Status: ${response.status()}, Length: ${text.length}`)
        } catch {
          // Response body may not be available
        }
      }
    }
  })
  
  try {
    // Navigate to the sell page
    console.log('\n📄 Loading UniverCell sell page...')
    await page.goto('https://univercell.ai/sell/details/mobile', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    })
    
    // Give the app time to fire its initial action requests without waiting for full network idle,
    // which appears to never settle on this page.
    await page.waitForTimeout(5000)
    
    // Look for Apple image/button in the makes section
    console.log('\n🍎 Looking for Apple button...')
    
    // Try multiple selectors for Apple
    const appleSelectors = [
      'img[alt*="Apple"]',
      '[alt*="Apple"]',
      'text=Apple',
      '[data-value="apple"]',
    ]
    
    for (const selector of appleSelectors) {
      const element = page.locator(selector).first()
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`   Found Apple with selector: ${selector}`)
        await element.click()
        console.log('   Waiting for models to load...')
        await page.waitForTimeout(8000)
        break
      }
    }
    
    // Wait for more network activity
    await page.waitForTimeout(5000)
    
    // Try clicking on an iPhone model if available
    console.log('\n📱 Looking for iPhone model...')
    const iphoneSelectors = [
      'text=iPhone 15',
      'text=iPhone 16',
      'text=iPhone 14',
      'img[alt*="iPhone"]',
    ]
    
    for (const selector of iphoneSelectors) {
      const element = page.locator(selector).first()
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`   Found iPhone with selector: ${selector}`)
        await element.click()
        await page.waitForTimeout(3000)
        break
      }
    }
    
  } catch (error) {
    console.error('Error navigating:', error instanceof Error ? error.message : error)
  }
  
  await browser.close()
  
  console.log('\n' + '='.repeat(60))
  console.log('📋 Captured Action Calls:')
  console.log('='.repeat(60))
  
  for (let i = 0; i < actionCalls.length; i++) {
    const call = actionCalls[i]
    console.log(`\n[${i + 1}] Action ID: ${call.actionId}`)
    console.log(`    Request Body: ${call.body.slice(0, 150)}`)
    
    // Parse response to identify
    let identity = 'unknown'
    if (call.body === '[]' && call.response.includes('"rd_id"')) {
      identity = 'getDeviceTypes'
    } else if (call.response.includes('"rb_id"') && !call.response.includes('"rd_id"')) {
      identity = 'getMakesForDeviceType'
    } else if (call.response.includes('sydCapacity') || call.response.includes('flawlessPrice') || call.response.includes('capacityPrices')) {
      identity = 'getModelsForMakeAndType'
    } else if (call.response.includes('$undefined')) {
      identity = 'statusUpdate (skip)'
    } else if (call.body.match(/^\[\d+,\d+\]$/)) {
      identity = 'getModelsForMakeAndType (by request pattern)'
    }
    
    console.log(`    → Identity: ${identity}`)
    if (call.response.length > 0 && call.response.length < 300) {
      console.log(`    Response: ${call.response}`)
    } else if (call.response.length >= 300) {
      console.log(`    Response preview: ${call.response.slice(0, 300)}...`)
    }
  }
  
  // Extract the correct action IDs
  const deviceTypesAction = actionCalls.find(c => c.body === '[]' && c.response.includes('"rd_id"'))
  const makesAction = actionCalls.find(c => c.response.includes('"rb_id"') && !c.response.includes('"rd_id"'))
  const modelsAction = actionCalls.find(c => 
    c.response.includes('sydCapacity') || 
    c.response.includes('flawlessPrice') || 
    c.response.includes('capacityPrices') ||
    c.body.match(/^\[\d+,\d+\]$/)  // Matches [brandId, deviceTypeId]
  )
  
  console.log('\n📝 Discovered Environment Variables:')
  console.log('-'.repeat(60))
  
  if (deviceTypesAction) {
    console.log(`UNIVERCELL_ACTION_GET_DEVICE_TYPES=${deviceTypesAction.actionId}`)
  } else {
    console.log('❌ Could not find getDeviceTypes action')
  }
  
  if (makesAction) {
    console.log(`UNIVERCELL_ACTION_GET_MAKES_FOR_DEVICE_TYPE=${makesAction.actionId}`)
  } else {
    console.log('❌ Could not find getMakes action')
  }
  
  if (modelsAction) {
    console.log(`UNIVERCELL_ACTION_GET_MODELS_FOR_MAKE_AND_TYPE=${modelsAction.actionId}`)
  } else {
    console.log('❌ Could not find getModels action - need to click on a make to trigger it')
  }
  
  console.log('\n✅ Done!')
}

main().catch(console.error)
