import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { mailer, verificationEmail } from '../email.js';
import { endSession, loadUser, publicUser, requireAuth, startSession } from './session.js';

const BCRYPT_ROUNDS = config.nodeEnv === 'test' ? 4 : 12;
// Compared against when no account matches, so sign-in takes similar time either way.
const DUMMY_HASH = bcrypt.hashSync('campusbazaar-timing-equaliser', BCRYPT_ROUNDS);
const RESEND_COOLDOWN_SECONDS = 60;

const universityEmail = z
  .string({ error: 'Enter your university email.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'))
  .refine((email) => config.allowedEmailDomains.includes(email.split('@').pop()), {
    message: 'Use your university email address.',
  });

const password = z
  .string({ error: 'Enter a password.' })
  .min(8, 'Password must be at least 8 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes.');

const registerSchema = z.object({ email: universityEmail });

const completeSchema = z.object({
  token: z.string({ error: 'Verification link is invalid.' }).min(20).max(200),
  name: z
    .string({ error: 'Enter your name.' })
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(100, 'Name must be at most 100 characters.'),
  password,
});

const signInSchema = z.object({
  email: z.string({ error: 'Enter your email.' }).trim().toLowerCase().max(254),
  password: z.string({ error: 'Enter your password.' }).max(200),
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.nodeEnv === 'test',
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' }),
});

export const authRouter = Router();

/**
 * Step 1 of registration: send a verification link to a university email.
 * Always answers the same way, so the response does not reveal whether an account exists.
 */
authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parseInput(registerSchema, req.body);

    const token = await withTransaction(async (conn) => {
      const [existing] = await conn.execute('SELECT id FROM users WHERE university_email = ?', [email]);
      if (existing.length > 0) return null;

      const [recent] = await conn.execute(
        `SELECT id FROM email_verifications
          WHERE email = ? AND used_at IS NULL
            AND created_at > UTC_TIMESTAMP() - INTERVAL ? SECOND`,
        [email, RESEND_COOLDOWN_SECONDS],
      );
      if (recent.length > 0) return null;

      await conn.execute('DELETE FROM email_verifications WHERE email = ? AND used_at IS NULL', [email]);
      const newToken = crypto.randomBytes(32).toString('base64url');
      await conn.execute(
        `INSERT INTO email_verifications (email, token_hash, expires_at)
         VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? HOUR)`,
        [email, hashToken(newToken), config.verificationHours],
      );
      return newToken;
    });

    if (token) {
      const link = `${config.clientOrigin}/verify-email?token=${encodeURIComponent(token)}`;
      await mailer.send({ to: email, ...verificationEmail(link, config.verificationHours) });
    }

    res.status(202).json({
      message: 'If this email can be registered, a verification link has been sent. Check your university inbox.',
    });
  }),
);

/** Step 2 of registration: the mailbox owner uses the link's token to create the account. */
authRouter.post(
  '/complete-registration',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = parseInput(completeSchema, req.body);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const userId = await withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT id, email FROM email_verifications
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
          FOR UPDATE`,
        [hashToken(input.token)],
      );
      if (rows.length === 0) {
        throw new HttpError(400, 'This verification link is invalid or has expired. Please register again.');
      }
      const verification = rows[0];

      let result;
      try {
        [result] = await conn.execute(
          `INSERT INTO users (name, university_email, password_hash, email_verified_at)
           VALUES (?, ?, ?, UTC_TIMESTAMP())`,
          [input.name, verification.email, passwordHash],
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw new HttpError(409, 'An account with this email already exists. Please sign in.');
        }
        throw error;
      }
      // Every student can both buy and sell (SRS 3.3); administrator is granted separately.
      await conn.query('INSERT INTO user_roles (user_id, role) VALUES ?', [
        [
          [result.insertId, 'buyer'],
          [result.insertId, 'seller'],
        ],
      ]);
      await conn.execute('UPDATE email_verifications SET used_at = UTC_TIMESTAMP() WHERE id = ?', [verification.id]);
      return result.insertId;
    });

    startSession(res, userId);
    res.status(201).json({ user: publicUser(await loadUser(userId)) });
  }),
);

authRouter.post(
  '/sign-in',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = parseInput(signInSchema, req.body);
    const [rows] = await pool.execute(
      'SELECT id, password_hash, account_status FROM users WHERE university_email = ?',
      [input.email],
    );
    const account = rows[0];
    const passwordMatches = await bcrypt.compare(input.password, account?.password_hash ?? DUMMY_HASH);
    if (!account || !passwordMatches) {
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    if (account.account_status !== 'active') {
      throw new HttpError(403, 'Your account has been suspended. Contact an administrator.');
    }
    startSession(res, account.id);
    res.json({ user: publicUser(await loadUser(account.id)) });
  }),
);

authRouter.post('/sign-out', (req, res) => {
  endSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
