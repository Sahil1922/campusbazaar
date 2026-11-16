import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, createUser, insertListing, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

const ALLOWED_CARD_FIELDS = ['auction', 'category', 'condition', 'id', 'images', 'price', 'priceNegotiable', 'status', 'title'];

describe('public home page data (signed-out visitors)', () => {
  it('is available without signing in and lists categories and recent available listings', async () => {
    const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
    const book = await insertListing(seller.user.id, { title: 'Maths book', categoryId: 1 });
    await insertListing(seller.user.id, { title: 'Removed item', status: 'removed' });
    await insertListing(seller.user.id, { title: 'Sold item', status: 'sold' });
    await insertListing(seller.user.id, { title: 'Deleted item', status: 'deleted' });

    const res = await request(app).get('/api/public/home').expect(200);
    expect(res.body.categories).toHaveLength(7);
    expect(res.body.listings.map((l) => l.title)).toEqual(['Maths book']);
    expect(res.body.totalListings).toBe(1);
    expect(res.body.listings[0]).toMatchObject({ id: book, category: { name: 'Books' }, price: 500 });
  });

  it('exposes only card details — no seller, description or other private data', async () => {
    const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
    await insertListing(seller.user.id);
    const res = await request(app).get('/api/public/home').expect(200);
    const card = res.body.listings[0];
    expect(Object.keys(card).sort()).toEqual(ALLOWED_CARD_FIELDS);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Rohan');
    expect(body).not.toContain('seller@uni.test');
    expect(body).not.toContain('A useful item for students.'); // description
  });

  it('shows open auctions ending soonest first, at their current bid', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const soon = await insertListing(seller.user.id, { title: 'Ends soon', status: 'in_auction' });
    const later = await insertListing(seller.user.id, { title: 'Ends later', status: 'in_auction' });
    const ended = await insertListing(seller.user.id, { title: 'Already ended', status: 'in_auction' });
    await pool.query(
      `INSERT INTO auctions (listing_id, starting_price, bid_increment, start_time, end_time, current_bid) VALUES
        (?, 100, 10, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 HOUR, 150),
        (?, 100, 10, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, NULL),
        (?, 100, 10, UTC_TIMESTAMP() - INTERVAL 2 DAY, UTC_TIMESTAMP() - INTERVAL 1 HOUR, 300)`,
      [soon, later, ended],
    );
    const res = await request(app).get('/api/public/home').expect(200);
    expect(res.body.liveAuctions.map((a) => a.title)).toEqual(['Ends soon', 'Ends later']);
    expect(res.body.liveAuctions[0].auction).toMatchObject({ status: 'active', currentBid: 150 });
  });

  it('keeps everything else behind sign-in', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const id = await insertListing(seller.user.id);
    await request(app).get('/api/listings').expect(401);
    await request(app).get(`/api/listings/${id}`).expect(401);
    await request(app).get('/api/auctions').expect(401);
    await request(app).get('/api/categories').expect(401);
  });
});
