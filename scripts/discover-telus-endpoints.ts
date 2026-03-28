#!/usr/bin/env npx tsx
import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('/trade-in') || url.includes('/backend/') || url.includes('/bring-it-back')) {
      const headers = req.headers()
      const compactHeaders = {
        'user-agent': headers['user-agent'],
        accept: headers['accept'],
        referer: headers['referer'],
        origin: headers['origin'],
        cookie: headers['cookie'] ? '[present]' : '[none]',
      }
      console.log('\nREQUEST', req.method(), url)
      console.log('HEADERS', JSON.stringify(compactHeaders))
      const post = req.postData()
      if (post) console.log('BODY', post.slice(0, 500))
    }
  })

  page.on('response', async (res) => {
    const url = res.url()
    if (url.includes('/trade-in') || url.includes('/backend/') || url.includes('/bring-it-back')) {
      console.log('RESPONSE', res.status(), url)
      if (url.includes('/backend/')) {
        try {
          const text = await res.text()
          console.log('BACKEND_BODY_PREVIEW', text.slice(0, 1000))
        } catch {
          // ignore body read failures
        }
      }
    }
  })

  await page.goto('https://www.telus.com/en/mobility/trade-in-bring-it-back-returns', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })

  await page.waitForTimeout(15000)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
