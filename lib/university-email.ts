import 'server-only';
import nodemailer from 'nodemailer';

type EmailConfiguration =
  | { provider: 'resend'; apiKey: string; from: string; appUrl: string }
  | { provider: 'smtp'; host: string; port: number; user: string; password: string; from: string; appUrl: string };

function getAppUrl(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL is not configured.');

  let parsedAppUrl: URL;
  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    throw new Error('APP_URL must be a valid absolute URL.');
  }
  if (
    !['http:', 'https:'].includes(parsedAppUrl.protocol) ||
    parsedAppUrl.username ||
    parsedAppUrl.password ||
    (process.env.NODE_ENV === 'production' && parsedAppUrl.protocol !== 'https:')
  ) {
    throw new Error('APP_URL must be a secure absolute URL.');
  }
  return parsedAppUrl.origin;
}

function getEmailConfiguration(): EmailConfiguration {
  const apiKey = process.env.RESEND_API_KEY;
  const appUrl = getAppUrl();
  if (apiKey) {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error('EMAIL_FROM must be set when using Resend.');
    return { provider: 'resend', apiKey, from, appUrl };
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const rawPassword = process.env.SMTP_PASS;
  const password = host?.toLowerCase() === 'smtp.gmail.com'
    ? rawPassword?.replace(/\s/g, '')
    : rawPassword;
  const from = process.env.EMAIL_FROM || user;
  const localHost = host && ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase());
  if (
    !host ||
    !from ||
    (!localHost && (!user || !password)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'Configure Resend or SMTP. SMTP authentication is required except for loopback development hosts.',
    );
  }
  return {
    provider: 'smtp',
    host,
    port,
    user: user ?? '',
    password: password ?? '',
    from,
    appUrl,
  };
}

export function assertUniversityEmailConfigured(): void {
  getEmailConfiguration();
}

export function getUniversityAdminEmail(): string {
  const email = process.env.UNIVERSITY_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('UNIVERSITY_ADMIN_EMAIL is not configured with a valid email.');
  }
  return email;
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] as string);
}

export async function sendUniversityEmail(to: string, subject: string, html: string) {
  const configuration = getEmailConfiguration();
  try {
    if (configuration.provider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: configuration.from, to: [to], subject, html }),
      });
      if (!response.ok) {
        console.error('University email delivery failed:', response.status);
        throw new Error('Unable to deliver university registration email.');
      }
      return;
    }

    const localHost = ['localhost', '127.0.0.1', '::1'].includes(configuration.host.toLowerCase());
    const transporter = nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.port === 465,
      ...(!localHost ? { auth: { user: configuration.user, pass: configuration.password } } : {}),
    });
    await transporter.sendMail({ from: configuration.from, to, subject, html });
  } catch (error) {
    console.error('University email delivery failed:', error instanceof Error ? error.message : 'unknown error');
    throw new Error('Unable to deliver university registration email.');
  }
}

export { getAppUrl };