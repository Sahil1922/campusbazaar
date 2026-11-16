import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';

/**
 * Per-user rate limit for actions that create content (messages, reviews, reports).
 * Use after requireAuth. Disabled in automated tests.
 */
export function perUserLimit({ windowMinutes, limit, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user.id}`,
    skip: () => config.nodeEnv === 'test',
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}
