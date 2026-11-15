import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, createUser, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

describe('UC-01 View Profile', () => {
  it('requires sign-in', async () => {
    await request(app).get('/api/profile').expect(401);
  });

  it("shows the user's own information and marketplace activity", async () => {
    const { agent } = await createUser({ email: 'meera@uni.test', name: 'Meera' });
    const res = await agent.get('/api/profile').expect(200);
    expect(res.body.profile).toMatchObject({
      name: 'Meera',
      email: 'meera@uni.test',
      roles: ['buyer', 'seller'],
      accountStatus: 'active',
    });
    expect(res.body.activity).toEqual({
      listingsPosted: 0,
      activeListings: 0,
      bidsPlaced: 0,
      reviewsReceived: 0,
      averageRating: null,
    });
  });

  it('calculates activity from stored listings and reviews', async () => {
    const { agent, user } = await createUser({ email: 'seller@uni.test' });
    const { user: other } = await createUser({ email: 'buyer@uni.test' });
    const [cat] = await pool.query("INSERT INTO categories (name) VALUES ('Books')");
    await pool.query(
      `INSERT INTO listings (seller_id, title, description, category_id, item_condition, price, status) VALUES
        (?, 'A', 'd', ?, 'good', 100, 'active'),
        (?, 'B', 'd', ?, 'good', 100, 'sold'),
        (?, 'C', 'd', ?, 'good', 100, 'removed')`,
      [user.id, cat.insertId, user.id, cat.insertId, user.id, cat.insertId],
    );
    await pool.query(
      'INSERT INTO reviews (reviewer_id, reviewee_id, rating) VALUES (?, ?, 4), (?, ?, 5)',
      [other.id, user.id, other.id, user.id],
    );
    const res = await agent.get('/api/profile').expect(200);
    expect(res.body.activity).toMatchObject({
      listingsPosted: 2,
      activeListings: 1,
      reviewsReceived: 2,
      averageRating: 4.5,
    });
  });

  it('blocks a user suspended after signing in on their next request', async () => {
    const { agent, user } = await createUser({ email: 'later@uni.test' });
    await agent.get('/api/profile').expect(200);
    await pool.query("UPDATE users SET account_status = 'suspended' WHERE id = ?", [user.id]);
    await agent.get('/api/profile').expect(403);
  });
});
