import nodemailer from 'nodemailer';
import { config } from './config.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10_000;

let transport = null;
if (!config.brevoApiKey && config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

/** Splits EMAIL_FROM ("CampusBazaar <no-reply@example.com>" or a bare address) into name and email. */
export function parseSender(from) {
  // Tolerate a whole value wrapped in quotes, e.g. EMAIL_FROM="CampusBazaar <a@b.c>" kept literally by a host's settings.
  const value = from.trim().replace(/^"(.*)"$/, '$1');
  const match = /^\s*(.*?)\s*<([^<>\s]+)>\s*$/.exec(value);
  if (match) return match[1] ? { name: match[1].replace(/^"|"$/g, ''), email: match[2] } : { email: match[2] };
  return { email: value.trim() };
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sends through Brevo's transactional email API (HTTPS, port 443). */
async function sendWithBrevo({ to, subject, text }) {
  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: parseSender(config.smtp.from),
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!response.ok) {
    // Brevo's error body names the problem (e.g. an unverified sender); it never contains the API key.
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`Brevo email API returned ${response.status}: ${detail}`);
  }
}

export const mailer = {
  /**
   * Sends an email: through Brevo when BREVO_API_KEY is set, otherwise through SMTP. With neither
   * (development only — config refuses to start in production) the message is printed to the console.
   */
  async send({ to, subject, text }) {
    if (config.brevoApiKey) {
      await sendWithBrevo({ to, subject, text });
      return;
    }
    if (transport) {
      await transport.sendMail({ from: config.smtp.from, to, subject, text });
      return;
    }
    if (config.nodeEnv !== 'test') {
      console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    }
  },
};

export function verificationEmail(link, hours) {
  return {
    subject: 'Verify your CampusBazaar account',
    text:
      `Welcome to CampusBazaar!\n\n` +
      `Open this link to verify your university email and finish creating your account:\n${link}\n\n` +
      `The link expires in ${hours} hours. If you did not request this, you can ignore this email.`,
  };
}
