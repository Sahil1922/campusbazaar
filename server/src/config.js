import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

const allowedEmailDomains = required('ALLOWED_EMAIL_DOMAINS')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
if (allowedEmailDomains.length === 0) {
  throw new Error('ALLOWED_EMAIL_DOMAINS must list at least one domain');
}

const smtpHost = optional('SMTP_HOST');
if (isProduction && !smtpHost) {
  throw new Error('SMTP_HOST is required in production so verification emails can be sent');
}

// Listing photos are stored on the server's disk (approved for Sprint 2).
const uploadDir = path.resolve(optional('UPLOAD_DIR', fileURLToPath(new URL('../uploads', import.meta.url))));

// In production the API server also serves the built React app (client/dist), so one process
// runs the whole site on one origin (no CORS needed, session cookie stays same-site).
const serveClient = optional('SERVE_CLIENT', isProduction ? 'true' : 'false') === 'true';
const clientDistDir = path.resolve(optional('CLIENT_DIST_DIR', fileURLToPath(new URL('../../client/dist', import.meta.url))));

// Number of reverse proxies in front of the app (e.g. 1 behind a hosting provider's HTTPS proxy).
// Needed so rate limits see the visitor's real IP address.
const trustProxy = Number(optional('TRUST_PROXY', '0'));
if (!Number.isInteger(trustProxy) || trustProxy < 0) {
  throw new Error('TRUST_PROXY must be a whole number (0 when the app is not behind a proxy)');
}

const clientOrigin = optional('CLIENT_ORIGIN', 'http://localhost:5173');
if (isProduction && !clientOrigin.startsWith('https://')) {
  console.warn(
    `Warning: CLIENT_ORIGIN is ${clientOrigin}. In production it should be the site's https:// address — ` +
      'session cookies are marked Secure and are only sent over HTTPS.',
  );
}

export const config = Object.freeze({
  uploadDir,
  serveClient,
  clientDistDir,
  trustProxy,
  nodeEnv,
  isProduction,
  port: Number(optional('PORT', '4000')),
  clientOrigin,
  jwtSecret,
  sessionDays: 7,
  verificationHours: 24,
  allowedEmailDomains,
  db: Object.freeze({
    host: optional('DB_HOST', '127.0.0.1'),
    port: Number(optional('DB_PORT', '3306')),
    user: required('DB_USER'),
    password: optional('DB_PASSWORD'),
    database: optional('DB_NAME', 'campusbazaar'),
  }),
  smtp: Object.freeze({
    host: smtpHost,
    port: Number(optional('SMTP_PORT', '587')),
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
    from: optional('EMAIL_FROM', 'CampusBazaar <no-reply@campusbazaar.local>'),
  }),
});
