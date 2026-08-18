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

describe('user/staff-entered text is HTML-escaped before it reaches an email', () => {
  let sent: { html: string }[]
  const XSS = '<img src=x onerror=alert(document.cookie)>'

  beforeEach(() => {
    sent = []
    vi.spyOn(EmailService, 'sendEmail').mockImplementation(async (...args: unknown[]) => {
      sent.push({ html: args[2] as string })
      return true
    })
  })

  it('escapes a malicious recipientName instead of rendering it verbatim', async () => {
    await EmailService.sendWelcomeEmail({ to: 'c@example.com', recipientName: XSS, role: 'customer', tempPassword: 'x' })
    const { html } = sent[0]
    expect(html).not.toContain(XSS)
    expect(html).toContain('&lt;img src=x onerror=alert(document.cookie)&gt;')
  })

  it('escapes carrier and tracking number on the shipment status email', async () => {
    await EmailService.sendShipmentStatusEmail({
      to: 'c@example.com', recipientName: 'Casey', orderNumber: 'PO-1', orderId: 'oid',
      trackingNumber: XSS, carrier: XSS, status: 'in_transit',
    })
    const { html } = sent[0]
    expect(html).not.toContain(XSS)
  })

  it('escapes organizationName on the recurring trade-in reminder', async () => {
    await EmailService.sendRecurringTradeInReminderEmail({
      to: 'c@example.com', recipientName: 'Casey', organizationName: XSS, frequency: 'monthly',
    })
    const { html } = sent[0]
    expect(html).not.toContain(XSS)
  })

  it('does not mangle an ordinary name with no special characters', async () => {
    await EmailService.sendWelcomeEmail({ to: 'c@example.com', recipientName: "O'Brien & Sons", role: 'customer', tempPassword: 'x' })
    const { html } = sent[0]
    expect(html).toContain('O&#39;Brien &amp; Sons')
  })
})
