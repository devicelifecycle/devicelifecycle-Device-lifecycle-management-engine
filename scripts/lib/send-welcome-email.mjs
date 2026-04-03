import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'DLM Engine';

function getLoginUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000';

  return `${baseUrl.replace(/\/$/, '')}/login`;
}

function getGmailTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder') return null;
  return new Resend(apiKey);
}

export async function sendWelcomeCredentialsEmail({
  to,
  recipientName,
  role,
  password,
  loginId,
}) {
  if (!to || to.endsWith('@login.local')) {
    return { sent: false, reason: 'no-real-email' };
  }

  const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
  const loginUrl = getLoginUrl();
  const credentialLabel = loginId ? 'Login ID' : 'Email';
  const credentialValue = loginId || to;
  const subject = `${APP_NAME}: Your ${roleLabel} account is ready`;

  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
      <h1 style="margin:0 0 16px;font-size:24px;">${APP_NAME}</h1>
      <p style="margin:0 0 16px;">Hi ${recipientName},</p>
      <p style="margin:0 0 24px;">Your ${roleLabel} account is ready. You can sign in right away with the credentials below.</p>
      <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 8px;"><strong>${credentialLabel}:</strong> ${credentialValue}</p>
        <p style="margin:0;"><strong>Password:</strong> ${password}</p>
      </div>
      <p style="margin:0 0 24px;">
        <a href="${loginUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;">Sign in to ${APP_NAME}</a>
      </p>
      <p style="margin:0;color:#52525b;font-size:14px;">For security, please sign in and change your password after your first login.</p>
    </div>
  </body>
</html>`;

  const gmail = getGmailTransporter();
  if (gmail) {
    try {
      const fromEmail = process.env.GMAIL_FROM_EMAIL || `${APP_NAME} <${process.env.GMAIL_USER}>`;
      await gmail.sendMail({
        from: fromEmail,
        to,
        subject,
        html,
      });
      return { sent: true, provider: 'gmail' };
    } catch (error) {
      console.error('[sendWelcomeCredentialsEmail] Gmail error:', error);
      return { sent: false, reason: 'gmail-failed' };
    }
  }

  const resend = getResendClient();
  if (resend) {
    try {
      const from = process.env.RESEND_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || 'DLM Engine <onboarding@resend.dev>';
      const response = await resend.emails.send({
        from,
        to,
        subject,
        html,
      });

      if (response.error) {
        console.error('[sendWelcomeCredentialsEmail] Resend error:', response.error);
        return { sent: false, reason: 'resend-failed' };
      }

      return { sent: true, provider: 'resend' };
    } catch (error) {
      console.error('[sendWelcomeCredentialsEmail] Resend exception:', error);
      return { sent: false, reason: 'resend-exception' };
    }
  }

  console.warn('[sendWelcomeCredentialsEmail] No email provider configured.');
  return { sent: false, reason: 'no-provider' };
}
