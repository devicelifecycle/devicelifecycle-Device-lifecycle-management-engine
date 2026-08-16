import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmailService } from '@/services/email.service'

// These emails all render through the shared emailShell() wrapper. The tests
// pin the behaviour that matters: the branded header/footer frame is present,
// the correct footer variant is used, and each body's unique content survives.

describe('transactional emails share one branded shell', () => {
  let sent: { to: unknown; subject: string; html: string }[]

  beforeEach(() => {
    sent = []
    vi.spyOn(EmailService, 'sendEmail').mockImplementation(
      async (...args: unknown[]) => {
        sent.push({ to: args[0], subject: args[1] as string, html: args[2] as string })
        return true
      },
    )
  })

  it('wraps the shipment status email: header frame + carrier/tracking body + full footer', async () => {
    await EmailService.sendShipmentStatusEmail({
      to: 'c@example.com', recipientName: 'Casey', orderNumber: 'PO-1', orderId: 'oid',
      trackingNumber: 'TRK123', carrier: 'Purolator', status: 'in_transit', direction: 'outbound',
    })
    expect(sent).toHaveLength(1)
    const { html, subject } = sent[0]
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Device Lifecycle Management Platform') // header (all emails)
    expect(html).toContain('TRK123')                               // body: tracking
    expect(html).toContain('Purolator')                            // body: carrier
    expect(html).toContain('All rights reserved')                  // full footer
    expect(subject).toContain('In Transit')
  })

  it('uses the short footer (no tagline / no rights line) for security mail', async () => {
    await EmailService.sendPasswordResetOtp({ to: 'c@example.com', recipientName: 'Casey', otp: '123456' })
    const { html } = sent[0]
    expect(html).toContain('123456')                 // body: OTP
    expect(html).toContain('&copy;')                 // short footer copyright
    expect(html).not.toContain('All rights reserved') // short footer omits this
  })

  it('renders the order confirmation body inside the shell', async () => {
    await EmailService.sendOrderConfirmationEmail({
      to: 'c@example.com', recipientName: 'Casey', orderNumber: 'PO-9', orderId: 'oid',
      orderType: 'trade_in', itemCount: 3,
    })
    const { html } = sent[0]
    expect(html).toContain('PO-9')
    expect(html).toContain('What happens next')
    expect(html).toContain('All rights reserved')
  })

  it('renders the order status email (the commented template) through the shell', async () => {
    await EmailService.sendOrderStatusEmail({
      to: 'c@example.com', recipientName: 'Casey', orderNumber: 'PO-7', orderId: 'oid',
      fromStatus: 'submitted', toStatus: 'in_triage', subject: 'Status update', message: 'Your order moved.',
    })
    const { html } = sent[0]
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Your order moved.')  // body message
    expect(html).toContain('In Triage')          // status label
    expect(html).toContain('All rights reserved')
  })
})
