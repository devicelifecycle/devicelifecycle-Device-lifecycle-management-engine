#!/usr/bin/env npx tsx
/**
 * Send a test email to verify templates and Resend integration.
 * Usage: npm run send-test-email [email]
 *        npx tsx --env-file=.env.local scripts/send-test-email.ts saikoushik1410@gmail.com
 * Default email: saikoushik1410@gmail.com
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { EmailService } from '../src/services/email.service'

const TEST_EMAIL = process.argv[2] || 'saikoushik1410@gmail.com'

async function main() {
  console.log(`\nSending test emails to: ${TEST_EMAIL}\n`)

  // 1. Order confirmation template
  console.log('1. Order confirmation template...')
  const ok1 = await EmailService.sendOrderConfirmationEmail({
    to: TEST_EMAIL,
    recipientName: 'Test User',
    orderNumber: 'ORD-20260308-0001',
    orderId: '00000000-0000-0000-0000-000000000001',
    orderType: 'trade_in',
    itemCount: 3,
  })
  console.log(ok1 ? '   ✓ Sent' : '   ✗ Failed (check RESEND_API_KEY in .env.local)')
  await new Promise((r) => setTimeout(r, 600)) // avoid Resend 2 req/sec rate limit

  // 2. Order status update template
  console.log('2. Order status update template...')
  const ok2 = await EmailService.sendOrderStatusEmail({
    to: TEST_EMAIL,
    recipientName: 'Test User',
    orderNumber: 'ORD-20260308-0002',
    orderId: '00000000-0000-0000-0000-000000000002',
    fromStatus: 'draft',
    toStatus: 'quoted',
    subject: 'Your quote is ready',
    message: 'We have prepared a quote for your order. Please review and respond.',
  })
  console.log(ok2 ? '   ✓ Sent' : '   ✗ Failed')
  await new Promise((r) => setTimeout(r, 600))

  // 3. Welcome email template
  console.log('3. Welcome email template...')
  const ok3 = await EmailService.sendWelcomeEmail({
    to: TEST_EMAIL,
    recipientName: 'Test User',
    role: 'sales',
    tempPassword: 'TempPass123!',
    loginId: 'test-user',
  })
  console.log(ok3 ? '   ✓ Sent' : '   ✗ Failed')

  const sent = [ok1, ok2, ok3].filter(Boolean).length
  console.log(`\n${sent} of 3 emails sent. Check your inbox (and spam folder).\n`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
