import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { mailer } from '../src/email.js';

export const app = createApp();

// Categories are seeded reference data (db/schema.sql), so they are not cleared between tests.
const TABLES = [
  'notifications', 'admin_actions', 'complaints', 'reports', 'bids', 'auctions', 'reviews',
  'messages', 'listing_images', 'listings', 'email_verifications', 'user_roles', 'users',
];

export async function resetDatabase() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) await pool.query(`TRUNCATE TABLE \`${table}\``);
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

/** Spies on outgoing email and returns the captured messages. */
export function captureEmails() {
  const sent = [];
  vi.spyOn(mailer, 'send').mockImplementation(async (message) => {
    sent.push(message);
  });
  return sent;
}

export function tokenFromEmail(message) {
  const match = /token=([A-Za-z0-9_\-%]+)/.exec(message.text);
  if (!match) throw new Error('No verification token in email');
  return decodeURIComponent(match[1]);
}

/** Registers and verifies an account; returns a supertest agent signed in as that user. */
export async function createUser({ email, name = 'Test Student', password = 'correct-horse-battery' }) {
  const sent = captureEmails();
  await request(app).post('/api/auth/register').send({ email }).expect(202);
  const token = tokenFromEmail(sent.at(-1));
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/complete-registration')
    .send({ token, name, password })
    .expect(201);
  vi.restoreAllMocks();
  return { agent, user: res.body.user, password };
}

/** Inserts a listing directly (faster than the multipart API) and returns its id. */
export async function insertListing(sellerId, { title = 'Study lamp', status = 'active', price = 500, categoryId = 3 } = {}) {
  const [result] = await pool.execute(
    `INSERT INTO listings (seller_id, title, description, category_id, item_condition, price, status)
     VALUES (?, ?, 'A useful item for students.', ?, 'good', ?, ?)`,
    [sellerId, title, categoryId, price, status],
  );
  return result.insertId;
}

export async function makeAdmin(userId) {
  await pool.execute("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')", [userId]);
}
