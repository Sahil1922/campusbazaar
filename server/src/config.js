import 'dotenv/config';

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

export const config = Object.freeze({
  nodeEnv,
  isProduction,
  port: Number(optional('PORT', '4000')),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173'),
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
