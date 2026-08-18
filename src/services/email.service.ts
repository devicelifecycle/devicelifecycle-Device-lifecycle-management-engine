// ============================================================================
// EMAIL SERVICE (Resend or Gmail SMTP) + SMS (Twilio)
// ============================================================================

import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { getAppPath } from '@/lib/app-url'
import { getTwilioClient, getTwilioConfig, isTwilioConfigured } from '@/lib/twilio/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

if (typeof window !== 'undefined') {
  throw new Error('EmailService cannot be imported in the browser')
}

// Fire-and-forget — a logging failure must never affect the actual send result.
function logNotificationAttempt(input: {
  channel: 'email' | 'sms'
  recipient: string
  subject?: string
  provider?: string
  status: 'sent' | 'failed'
  errorMessage?: string
}): void {
  try {
    const supabase = createServiceRoleClient()
    void supabase.from('notification_attempts').insert({
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject,
      provider: input.provider,
      status: input.status,
      error_message: input.errorMessage,
    }).then(({ error }) => {
      if (error) console.error('[EmailService] failed to log notification attempt:', error)
    })
  } catch (err) {
    console.error('[EmailService] failed to log notification attempt:', err)
  }
}

let resendClient: Resend | null = null
let gmailTransporter: Transporter | null = null
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Byte-Back'
const APP_TAGLINE = 'Device Lifecycle Management Platform'

/**
 * Escape HTML-significant characters before interpolating user/staff-entered
 * text into an email template. Every email below is built with raw template
 * strings, not a templating engine with auto-escaping, so this is the only
 * thing standing between a name/company/carrier field containing
 * "<img src=x onerror=...>" and it executing when the recipient (which may be
 * an admin, not the person who entered the text) opens the email.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || 'Byte-Back <onboarding@resend.dev>'
}

/**
 * Shared branded wrapper for every transactional email — the outer table, blue
 * gradient header, and footer. Callers pass only the unique body HTML (the
 * contents of the padded content cell). `footer` picks the copyright line:
 * 'full' includes the tagline + "All rights reserved" (customer-facing mail),
 * 'short' is a terse copyright (security/account mail).
 */
function emailShell(body: string, footer: 'full' | 'short' = 'full'): string {
  const year = new Date().getFullYear()
  const footerText = footer === 'short'
    ? `&copy; ${year} ${APP_NAME}.`
    : `&copy; ${year} ${APP_NAME} — ${APP_TAGLINE}. All rights reserved.`
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1e9df;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1e9df;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#1d4ed8;background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:26px 32px;border-bottom:3px solid #93c5fd;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.01em;">${APP_NAME}</h1><p style="margin:5px 0 0;color:#dbeafe;font-size:12px;letter-spacing:0.03em;">${APP_TAGLINE}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f7efe4;border-top:1px solid #e6d8c6;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">${footerText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function getGmailTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null

  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
  }

  return gmailTransporter
}

/**
 * Derive a plain-text fallback from an HTML email body. Sending HTML-only
 * (no multipart text/plain alternative) is itself a spam-filter signal —
 * most legitimate transactional mail includes both parts.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === 're_placeholder') return null

  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }

  return resendClient
}

export class EmailService {
  static isTwilioConfigured(): boolean {
    return isTwilioConfigured()
  }

  /**
   * Send an email via Gmail SMTP (if configured) or Resend. Never throws — logs errors and returns false.
   * Gmail option: no domain verification needed — set GMAIL_USER + GMAIL_APP_PASSWORD in .env.local.
   */
  static async sendEmail(
    to: string | string[],
    subject: string,
    html: string
  ): Promise<boolean> {
    const toList = Array.isArray(to) ? to : [to]
    const recipient = toList.join(', ')
    const from = getFromEmail()

    // Prefer Gmail SMTP — easiest path, sends to anyone with no domain verification
    const gmail = getGmailTransporter()
    if (gmail) {
      try {
        const fromEmail = process.env.GMAIL_FROM_EMAIL || `${APP_NAME} <${process.env.GMAIL_USER}>`
        await gmail.sendMail({
          from: fromEmail,
          to: toList,
          subject,
          html,
          text: htmlToPlainText(html),
        })
        logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'gmail', status: 'sent' })
        return true
      } catch (err) {
        console.error('[EmailService] Gmail error:', err)
        logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'gmail', status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
        return false
      }
    }

    // Fallback to Resend
    const resend = getResendClient()
    if (!resend) {
      console.warn('[EmailService] No email provider configured. Set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY')
      logNotificationAttempt({ channel: 'email', recipient, subject, status: 'failed', errorMessage: 'No email provider configured' })
      return false
    }

    try {
      const { error } = await resend.emails.send({
        from: from,
        to: toList,
        subject,
        html,
        text: htmlToPlainText(html),
      })

      if (error) {
        console.error('[EmailService] Resend error:', error)
        logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'resend', status: 'failed', errorMessage: error.message })
        return false
      }

      logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'resend', status: 'sent' })
      return true
    } catch (err) {
      console.error('[EmailService] Failed to send email:', err)
      logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'resend', status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  /**
   * Send an email with file attachments (PDF, Excel, etc.).
   * Supports Gmail SMTP and Resend. Attachments are { filename, content (Buffer) }.
   */
  static async sendEmailWithAttachments(
    to: string | string[],
    subject: string,
    html: string,
    attachments: Array<{ filename: string; content: Buffer; contentType: string }>
  ): Promise<boolean> {
    const toList = Array.isArray(to) ? to : [to]
    const recipient = toList.join(', ')
    const from = getFromEmail()

    const gmail = getGmailTransporter()
    if (gmail) {
      try {
        const fromEmail = process.env.GMAIL_FROM_EMAIL || `${APP_NAME} <${process.env.GMAIL_USER}>`
        await gmail.sendMail({
          from: fromEmail,
          to: toList,
          subject,
          html,
          text: htmlToPlainText(html),
          attachments: attachments.map(a => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        })
        logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'gmail', status: 'sent' })
        return true
      } catch (err) {
        console.error('[EmailService] Gmail attachment error:', err)
        logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'gmail', status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
        return false
      }
    }

    const resend = getResendClient()
    if (!resend) {
      console.warn('[EmailService] No email provider configured for attachments')
      logNotificationAttempt({ channel: 'email', recipient, subject, status: 'failed', errorMessage: 'No email provider configured' })
      return false
    }

    try {
      const { error } = await resend.emails.send({
        from,
        to: toList,
        subject,
        html,
        text: htmlToPlainText(html),
        attachments: attachments.map(a => ({
          filename: a.filename,
          content: a.content,
        })),
      })
      if (error) {
        console.error('[EmailService] Resend attachment error:', error)
        logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'resend', status: 'failed', errorMessage: error.message })
        return false
      }
      logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'resend', status: 'sent' })
      return true
    } catch (err) {
      console.error('[EmailService] Failed to send email with attachments:', err)
      logNotificationAttempt({ channel: 'email', recipient, subject, provider: 'resend', status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  /**
   * Send an SMS through Twilio only.
   * Phone number should be digits only (e.g., "4165551234").
   */
  static async sendSMS(
    phoneNumber: string,
    message: string
  ): Promise<boolean> {
    // Strip non-digits from phone number
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits.length < 10) {
      console.warn(`[EmailService] Invalid phone number: ${phoneNumber}`)
      logNotificationAttempt({ channel: 'sms', recipient: phoneNumber, status: 'failed', errorMessage: 'Invalid phone number' })
      return false
    }

    const local = digits.slice(-10)
    const e164 = `+1${local}` // North American number

    const tw = getTwilioClient()
    const twilioFrom = getTwilioConfig()?.phoneNumber
    if (tw && twilioFrom) {
      try {
        await tw.messages.create({
          body: message.slice(0, 160),
          from: twilioFrom,
          to: e164,
        })
        console.log(`[SMS] Twilio sent to ${e164}`)
        logNotificationAttempt({ channel: 'sms', recipient: e164, provider: 'twilio', status: 'sent' })
        return true
      } catch (err) {
        console.error('[SMS] Twilio failed:', err)
        logNotificationAttempt({ channel: 'sms', recipient: e164, provider: 'twilio', status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
        return false
      }
    }

    console.warn('[EmailService] Twilio SMS is not configured — set TWILIO_* env vars')
    logNotificationAttempt({ channel: 'sms', recipient: e164, status: 'failed', errorMessage: 'Twilio not configured' })
    return false
  }

  /**
   * Send an order status update email with a branded template.
   */
  static async sendOrderStatusEmail(params: {
    to: string | string[]
    recipientName: string
    orderNumber: string
    orderId: string
    fromStatus: string
    toStatus: string
    subject: string
    message: string
  }): Promise<boolean> {
    const { to, orderNumber, orderId, fromStatus, toStatus, subject } = params
    const recipientName = escapeHtml(params.recipientName)
    const message = escapeHtml(params.message)
    const orderUrl = getAppPath(`/orders/${orderId}`)
    const statusLabel = toStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">${message}</p>

              <!-- Status Badge -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#faf4ec;border-radius:8px;width:100%;border:1px solid #eaddcb;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Order #${orderNumber}</p>
                    <p style="margin:0;color:#18181b;font-size:18px;font-weight:600;">${statusLabel}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">View Order Details</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">If you have questions, reply to this email or contact our support team.</p>`)

    return this.sendEmail(to, subject, html)
  }

  /**
   * Send a confirmation email when an admin creates a new user account.
   * Includes username (Login ID or email) and password so the user can log in.
   * For Login ID users, loginId is the ID they use to sign in (e.g. acme-corp).
   */
  static async sendWelcomeEmail(params: {
    to: string
    recipientName: string
    role: string
    tempPassword: string
    loginId?: string
  }): Promise<boolean> {
    const { to, role, tempPassword, loginId } = params
    const recipientName = escapeHtml(params.recipientName)
    const loginUrl = getAppPath('/login')
    const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const credentialLabel = loginId ? 'Username (Login ID)' : 'Username (Email)'
    const credentialValue = escapeHtml(loginId ?? to)

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your account has been created on ${APP_NAME}. Use the credentials below to sign in:</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#faf4ec;border-radius:8px;width:100%;border:1px solid #eaddcb;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Login Credentials</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>${credentialLabel}:</strong> ${credentialValue}</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Password:</strong> ${tempPassword}</p>
                    <p style="margin:0;color:#18181b;font-size:14px;"><strong>Role:</strong> ${roleLabel}</p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Log In Now</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#ef4444;font-size:13px;font-weight:500;">Please change your password after your first login (Profile → Change password).</p>
              <p style="margin:0;color:#a1a1aa;font-size:13px;">If you have questions, contact your administrator.</p>
`)

    return this.sendEmail(to, `Account confirmation — Your login details for ${APP_NAME}`, html)
  }

  /**
   * Send password reset email with link. Used for forgot-password flow
   * so we send via Resend instead of relying on Supabase's built-in email.
   */
  static async sendPasswordResetEmail(params: {
    to: string
    recipientName: string
    resetLink: string
  }): Promise<boolean> {
    const { to, resetLink } = params
    const recipientName = escapeHtml(params.recipientName)

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">You requested a password reset. Click the button below to set a new password:</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Reset Password</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#71717a;font-size:13px;">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
`, 'short')

    return this.sendEmail(to, `Reset your password — ${APP_NAME}`, html)
  }

  /**
   * Send a 6-digit OTP code for password reset.
   */
  static async sendPasswordResetOtp(params: {
    to: string
    recipientName: string
    otp: string
  }): Promise<boolean> {
    const { to, otp } = params
    const recipientName = escapeHtml(params.recipientName)

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your password reset verification code is:</p>

              <div style="margin:0 0 24px;text-align:center;">
                <span style="display:inline-block;padding:16px 32px;background:#f4f4f5;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;font-family:monospace;">${otp}</span>
              </div>

              <p style="margin:0 0 8px;color:#71717a;font-size:13px;">This code expires in 1 hour. Do not share it with anyone.</p>
              <p style="margin:0;color:#71717a;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
`, 'short')

    return this.sendEmail(to, `Your password reset code — ${APP_NAME}`, html)
  }

  /**
   * Send a confirmation email when the user changes or resets their password.
   * Only sent when the user has a real email (not @login.local).
   */
  static async sendPasswordChangeConfirmationEmail(params: {
    to: string
    recipientName: string
  }): Promise<boolean> {
    const { to } = params
    const recipientName = escapeHtml(params.recipientName)
    if (!to || to.endsWith('@login.local')) return false

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your password was successfully changed. If you did not make this change, please contact your Byte-Back administrator at support@byte-back.ca immediately.</p>
`, 'short')

    return this.sendEmail(to, `Password updated — ${APP_NAME}`, html)
  }

  /**
   * Send an order confirmation email when a new order is created.
   */
  static async sendOrderConfirmationEmail(params: {
    to: string
    recipientName: string
    orderNumber: string
    orderId: string
    orderType: string
    itemCount: number
  }): Promise<boolean> {
    const { to, orderNumber, orderId, orderType, itemCount } = params
    const recipientName = escapeHtml(params.recipientName)
    const orderUrl = getAppPath(`/orders/${orderId}`)
    const typeLabel = orderType === 'cpo' ? 'CPO (Certified Pre-Owned)' : 'Trade-In'

    const isCPO = orderType === 'cpo'

    const nextSteps = isCPO
      ? [
          { num: '1', text: '<strong>Pricing review</strong> — Our team reviews your request and prepares a competitive quote for your devices.' },
          { num: '2', text: '<strong>Quote sent to you</strong> — You\'ll receive a quote with the per-device CPO pricing. Review it in the portal and accept or decline.' },
          { num: '3', text: '<strong>Sourcing &amp; QC</strong> — Once accepted, devices are sourced and inspected to meet certified pre-owned standards.' },
          { num: '4', text: '<strong>Shipment</strong> — Devices are shipped directly to you with tracking information provided in the portal.' },
        ]
      : [
          { num: '1', text: '<strong>Device review</strong> — Our team evaluates your trade-in devices and determines the best pricing for each.' },
          { num: '2', text: '<strong>Quote sent to you</strong> — You\'ll receive a quote with the trade-in value per device. Accept or decline directly in the portal.' },
          { num: '3', text: '<strong>Shipping instructions</strong> — Once accepted, we\'ll email you prepaid shipping labels and instructions for sending your devices to us.' },
          { num: '4', text: '<strong>Inspection &amp; payment</strong> — We inspect your devices upon arrival and process your payment or account credit within 2–3 business days.' },
        ]

    const nextStepsRows = nextSteps.map(s => `
      <tr>
        <td style="width:28px;padding:8px 8px 8px 0;vertical-align:top;">
          <span style="display:inline-block;width:22px;height:22px;background:#1d4ed8;border-radius:50%;text-align:center;line-height:22px;color:#fff;font-size:11px;font-weight:700;">${s.num}</span>
        </td>
        <td style="padding:8px 0;color:#3f3f46;font-size:14px;line-height:1.5;">${s.text}</td>
      </tr>`).join('')

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your <strong>${typeLabel}</strong> order has been received. Here's what happens next.</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#faf4ec;border-radius:8px;width:100%;border:1px solid #eaddcb;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Order Summary</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Order #:</strong> ${orderNumber}</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Type:</strong> ${typeLabel}</p>
                    <p style="margin:0;color:#18181b;font-size:14px;"><strong>Items:</strong> ${itemCount} device${itemCount > 1 ? 's' : ''}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;color:#18181b;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">What happens next</p>
              <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 28px;">
                ${nextStepsRows}
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">View Your Order</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">You'll receive an email at each stage. If you have questions, reply to this email or log in to the portal and view your order.</p>
`)

    return this.sendEmail(to, `Order #${orderNumber} Confirmed — ${APP_NAME}`, html)
  }

  /**
   * Send a shipment status update to the customer, with carrier + tracking.
   * Fired on shipment creation and on every subsequent status change.
   */
  static async sendShipmentStatusEmail(params: {
    to: string
    recipientName: string
    orderNumber: string
    orderId: string
    trackingNumber: string
    carrier: string
    status: string
    direction?: string
  }): Promise<boolean> {
    const { to, orderNumber, orderId, status, direction } = params
    const recipientName = escapeHtml(params.recipientName)
    const trackingNumber = escapeHtml(params.trackingNumber)
    const carrier = escapeHtml(params.carrier)
    const orderUrl = getAppPath(`/orders/${orderId}`)

    const STATUS_COPY: Record<string, { label: string; message: string }> = {
      label_created: { label: 'Shipment Created', message: `A shipping label has been created${direction === 'outbound' ? ' for your order' : ''}. You can track it with the details below.` },
      picked_up: { label: 'Picked Up', message: 'The carrier has picked up the shipment and it is now in their network.' },
      in_transit: { label: 'In Transit', message: 'Your shipment is on its way.' },
      out_for_delivery: { label: 'Out for Delivery', message: 'Your shipment is out for delivery today.' },
      delivered: { label: 'Delivered', message: 'Your shipment has been delivered.' },
      exception: { label: 'Delivery Exception', message: 'There is a delay with your shipment. Our team is looking into it.' },
    }
    const copy = STATUS_COPY[status] || { label: status.replace(/_/g, ' '), message: 'Your shipment status has been updated.' }

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">${copy.message}</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#faf4ec;border-radius:8px;width:100%;border:1px solid #eaddcb;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Shipment Update</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Order #:</strong> ${orderNumber}</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Status:</strong> ${copy.label}</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Carrier:</strong> ${carrier}</p>
                    <p style="margin:0;color:#18181b;font-size:14px;"><strong>Tracking #:</strong> ${trackingNumber}</p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">View Your Order</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">You'll receive an email each time this shipment's status changes. If you have questions, reply to this email or log in to the portal.</p>
`)

    return this.sendEmail(to, `Order #${orderNumber} — ${copy.label} — ${APP_NAME}`, html)
  }

  /**
   * Send SLA reminder email to customer who hasn't responded to a quote.
   */
  static async sendSLAReminderEmail(params: {
    to: string
    recipientName: string
    orderNumber: string
    orderId: string
    daysRemaining: number
    quotedAmount?: number
  }): Promise<boolean> {
    const { to, orderNumber, orderId, daysRemaining, quotedAmount } = params
    const recipientName = escapeHtml(params.recipientName)
    const orderUrl = getAppPath(`/orders/${orderId}`)

    const urgencyColor = daysRemaining <= 2 ? '#ef4444' : daysRemaining <= 4 ? '#f59e0b' : '#3b82f6'
    const urgencyText = daysRemaining <= 2 ? 'Urgent: ' : ''
    const formattedAmount = quotedAmount != null
      ? `$${quotedAmount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">
                ${urgencyText}Your quote for Order #${orderNumber} is still awaiting your response.
                Please review and accept or reject the quote before it expires.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#faf4ec;border-radius:8px;width:100%;border:1px solid #eaddcb;border-collapse:collapse;">
                <tr>
                  <td style="padding:16px 24px;border-bottom:1px solid #e4e4e7;">
                    <p style="margin:0 0 4px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Order</p>
                    <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">#${orderNumber}</p>
                  </td>
                </tr>
                ${formattedAmount ? `
                <tr>
                  <td style="padding:16px 24px;border-bottom:1px solid #e4e4e7;">
                    <p style="margin:0 0 4px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Quoted Amount</p>
                    <p style="margin:0;color:#059669;font-size:22px;font-weight:700;">${formattedAmount}</p>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:16px 24px;">
                    <p style="margin:0 0 4px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Time Remaining</p>
                    <p style="margin:0;color:${urgencyColor};font-size:18px;font-weight:600;">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Review &amp; Respond to Quote</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">If you have questions about the quote, reply to this email or contact our team.</p>
`)

    return this.sendEmail(to, `${urgencyText}Quote Awaiting Response — Order #${orderNumber}`, html)
  }

  static async sendRecurringTradeInReminderEmail(params: {
    to: string
    recipientName: string
    organizationName?: string
    frequency: string
  }): Promise<boolean> {
    const { to, frequency } = params
    const recipientName = escapeHtml(params.recipientName)
    const organizationName = params.organizationName ? escapeHtml(params.organizationName) : params.organizationName
    const newOrderUrl = getAppPath('/orders/new/trade-in')
    const cadenceLabel = frequency.replace('_', '-')

    const html = emailShell(`
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">
                Based on your ${cadenceLabel} reminder schedule${organizationName ? ` for ${organizationName}` : ''}, now's a good time to submit your next trade-in batch — whenever you're ready, just list the devices and we'll take it from there.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:8px;">
                    <a href="${newOrderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Start a New Trade-In</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#a1a1aa;font-size:13px;">You can change or turn off this reminder schedule any time from your Team page.</p>
`)

    return this.sendEmail(to, 'Time for your next trade-in batch', html)
  }
}
