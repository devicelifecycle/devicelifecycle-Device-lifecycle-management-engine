// ============================================================================
// EMAIL SERVICE (Resend or Gmail SMTP) + SMS (Twilio)
// ============================================================================

import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { getAppPath } from '@/lib/app-url'
import { getTwilioClient, getTwilioConfig, isTwilioConfigured } from '@/lib/twilio/server'

if (typeof window !== 'undefined') {
  throw new Error('EmailService cannot be imported in the browser')
}

let resendClient: Resend | null = null
let gmailTransporter: Transporter | null = null
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'DLM Engine'

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || 'DLM Engine <onboarding@resend.dev>'
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
        })
        return true
      } catch (err) {
        console.error('[EmailService] Gmail error:', err)
        return false
      }
    }

    // Fallback to Resend
    const resend = getResendClient()
    if (!resend) {
      console.warn('[EmailService] No email provider configured. Set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY')
      return false
    }

    try {
      const { error } = await resend.emails.send({
        from: from,
        to: toList,
        subject,
        html,
      })

      if (error) {
        console.error('[EmailService] Resend error:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('[EmailService] Failed to send email:', err)
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
        return true
      } catch (err) {
        console.error('[SMS] Twilio failed:', err)
        return false
      }
    }

    console.warn('[EmailService] Twilio SMS is not configured — set TWILIO_* env vars')
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
    const { to, recipientName, orderNumber, orderId, fromStatus, toStatus, subject, message } = params
    const orderUrl = getAppPath(`/orders/${orderId}`)
    const statusLabel = toStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${APP_NAME}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">${message}</p>

              <!-- Status Badge -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f4f4f5;border-radius:8px;width:100%;">
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
                  <td style="background:#18181b;border-radius:6px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">View Order Details</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">If you have questions, reply to this email or contact our support team.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

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
    const { to, recipientName, role, tempPassword, loginId } = params
    const loginUrl = getAppPath('/login')
    const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const credentialLabel = loginId ? 'Username (Login ID)' : 'Username (Email)'
    const credentialValue = loginId ?? to

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your account has been created on ${APP_NAME}. Use the credentials below to sign in:</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f4f4f5;border-radius:8px;width:100%;">
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
                  <td style="background:#18181b;border-radius:6px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Log In Now</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#ef4444;font-size:13px;font-weight:500;">Please change your password after your first login (Profile → Change password).</p>
              <p style="margin:0;color:#a1a1aa;font-size:13px;">If you have questions, contact your administrator.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

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
    const { to, recipientName, resetLink } = params

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">You requested a password reset. Click the button below to set a new password:</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#18181b;border-radius:6px;">
                    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Reset Password</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#71717a;font-size:13px;">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    return this.sendEmail(to, `Reset your password — ${APP_NAME}`, html)
  }

  /**
   * Send a confirmation email when the user changes or resets their password.
   * Only sent when the user has a real email (not @login.local).
   */
  static async sendPasswordChangeConfirmationEmail(params: {
    to: string
    recipientName: string
  }): Promise<boolean> {
    const { to, recipientName } = params
    if (!to || to.endsWith('@login.local')) return false

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your password was successfully changed. If you did not make this change, please contact your administrator immediately.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

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
    const { to, recipientName, orderNumber, orderId, orderType, itemCount } = params
    const orderUrl = getAppPath(`/orders/${orderId}`)
    const typeLabel = orderType === 'cpo' ? 'CPO (Certified Pre-Owned)' : 'Trade-In'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Your order has been created successfully. Our team will review it and get back to you shortly.</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f4f4f5;border-radius:8px;width:100%;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Order Summary</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Order #:</strong> ${orderNumber}</p>
                    <p style="margin:0 0 4px;color:#18181b;font-size:14px;"><strong>Type:</strong> ${typeLabel}</p>
                    <p style="margin:0;color:#18181b;font-size:14px;"><strong>Items:</strong> ${itemCount} device${itemCount > 1 ? 's' : ''}</p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#18181b;border-radius:6px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">View Order</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">You'll receive email updates as your order progresses through each stage.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    return this.sendEmail(to, `Order #${orderNumber} Confirmed — ${APP_NAME}`, html)
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
  }): Promise<boolean> {
    const { to, recipientName, orderNumber, orderId, daysRemaining } = params
    const orderUrl = getAppPath(`/orders/${orderId}`)

    const urgencyColor = daysRemaining <= 2 ? '#ef4444' : daysRemaining <= 4 ? '#f59e0b' : '#3b82f6'
    const urgencyText = daysRemaining <= 2 ? 'Urgent: ' : ''

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">
                ${urgencyText}Your quote for Order #${orderNumber} is still awaiting your response.
                Please review and accept or reject the quote.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f4f4f5;border-radius:8px;width:100%;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Order #${orderNumber}</p>
                    <p style="margin:0;color:${urgencyColor};font-size:18px;font-weight:600;">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining to respond</p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#18181b;border-radius:6px;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">Review Quote</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#a1a1aa;font-size:13px;">If you have questions about the quote, reply to this email or contact our team.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    return this.sendEmail(to, `${urgencyText}Quote Awaiting Response — Order #${orderNumber}`, html)
  }
}
