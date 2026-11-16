import { existsSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { app, createUser, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

const valid = {
  title: 'Casio fx-991EX calculator',
  description: 'Works perfectly, comes with cover.',
  categoryId: '6',
  condition: 'like_new',
  price: '900',
};

/** Posts a listing as multipart form data. */
function postListing(agent, fields = {}, files = []) {
  let req = agent.post('/api/listings');
  for (const [key, value] of Object.entries({ ...valid, ...fields })) req = req.field(key, value);
  for (const file of files) req = req.attach('images', file.buffer, { filename: file.name, contentType: file.type });
  return req;
}

function putListing(agent, id, fields = {}, files = []) {
  let req = agent.put(`/api/listings/${id}`);
  for (const [key, value] of Object.entries({ ...valid, ...fields })) req = req.field(key, value);
  for (const file of files) req = req.attach('images', file.buffer, { filename: file.name, contentType: file.type });
  return req;
}

const png = (name = 'photo.png') => ({ buffer: PNG, name, type: 'image/png' });
const jpg = (name = 'photo.jpg') => ({ buffer: JPEG, name, type: 'image/jpeg' });
const onDisk = (url) => existsSync(path.join(config.uploadDir, url.replace(/^\/uploads\//, '')));

describe('access', () => {
  it('requires sign-in for listings and categories', async () => {
    await request(app).get('/api/listings').expect(401);
    await request(app).get('/api/categories').expect(401);
    await request(app).post('/api/listings').field('title', 'x').expect(401);
  });

  it('returns the approved categories', async () => {
    const { agent } = await createUser({ email: 'a@uni.test' });
    const res = await agent.get('/api/categories').expect(200);
    expect(res.body.categories.map((c) => c.name)).toEqual([
      'Books', 'Electronics', 'Furniture', 'Clothing', 'Sports', 'Stationery', 'Other',
    ]);
  });
});

describe('UC-02 Create Listing', () => {
  it('creates a listing owned by the signed-in seller', async () => {
    const { agent, user } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent).expect(201);
    expect(res.body.listing).toMatchObject({
      sellerId: user.id,
      title: valid.title,
      categoryId: 6,
      category: { name: 'Stationery' },
      condition: 'like_new',
      price: 900,
      status: 'active',
      images: [],
    });
  });

  it('keeps the price required and lets the seller mark it negotiable', async () => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const plain = (await postListing(agent).expect(201)).body.listing;
    expect(plain.priceNegotiable).toBe(false);
    const negotiable = (await postListing(agent, { priceNegotiable: 'true' }).expect(201)).body.listing;
    expect(negotiable).toMatchObject({ price: 900, priceNegotiable: true });
    const noPrice = await postListing(agent, { priceNegotiable: 'true', price: '' }).expect(400);
    expect(noPrice.body.details[0].field).toBe('price');
    const bad = await postListing(agent, { priceNegotiable: 'maybe' }).expect(400);
    expect(bad.body.details[0].field).toBe('priceNegotiable');
    const shown = await agent.get('/api/listings').expect(200);
    expect(shown.body.listings.find((l) => l.id === negotiable.id).priceNegotiable).toBe(true);
    const edited = await putListing(agent, negotiable.id, { priceNegotiable: 'false' }).expect(200);
    expect(edited.body.listing.priceNegotiable).toBe(false);
  });

  it('ignores a seller id sent by the browser', async () => {
    const { agent, user } = await createUser({ email: 'seller@uni.test' });
    const { user: other } = await createUser({ email: 'other@uni.test' });
    const res = await postListing(agent, { sellerId: String(other.id), seller_id: String(other.id) }).expect(201);
    expect(res.body.listing.sellerId).toBe(user.id);
  });

  it('reports every invalid field', async () => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent, { title: 'ab', description: 'short', categoryId: '', condition: 'mint', price: '' }).expect(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['categoryId', 'condition', 'description', 'price', 'title']);
  });

  it.each(['0', '-5', '12.345', '1000001', 'abc'])('rejects the price %s', async (price) => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent, { price }).expect(400);
    expect(res.body.details[0].field).toBe('price');
  });

  it('rejects a category that does not exist', async () => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent, { categoryId: '99' }).expect(400);
    expect(res.body.details[0].field).toBe('categoryId');
  });

  it('stores JPG and PNG photos and serves them', async () => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent, {}, [png(), jpg()]).expect(201);
    const { images } = res.body.listing;
    expect(images).toHaveLength(2);
    expect(images[0].url).toMatch(/^\/uploads\/listings\/[0-9a-f]{32}\.png$/);
    expect(images[1].url).toMatch(/\.jpg$/);
    const served = await agent.get(images[0].url).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects a file that only pretends to be an image, and saves nothing', async () => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const fake = { buffer: Buffer.from('<script>alert(1)</script>'), name: 'evil.png', type: 'image/png' };
    const res = await postListing(agent, {}, [png(), fake]).expect(400);
    expect(res.body.details[0]).toMatchObject({ field: 'images' });
    const [rows] = await pool.query('SELECT id FROM listings');
    expect(rows).toHaveLength(0);
  });

  it('rejects more than 5 photos', async () => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent, {}, [png(), png(), png(), png(), png(), png()]).expect(400);
    expect(res.body.details[0].field).toBe('images');
  });

  it('returns 404 for a missing photo file', async () => {
    await request(app).get('/uploads/listings/does-not-exist.png').expect(404);
  });
});

describe('UC-03 View Listings and UC-04 Search and Filter', () => {
  async function seed() {
    const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
    const buyer = await createUser({ email: 'buyer@uni.test' });
    const make = async (fields) => (await postListing(seller.agent, fields).expect(201)).body.listing;
    const book = await make({ title: 'Engineering Mathematics book', description: 'Grewal 44th edition, clean pages.', categoryId: '1', condition: 'good', price: '450' });
    const lamp = await make({ title: 'Study lamp', description: 'LED lamp with three brightness levels.', categoryId: '3', condition: 'new', price: '700' });
    const calc = await make({ title: 'Scientific calculator', description: 'Allowed in exams, like new.', categoryId: '6', condition: 'like_new', price: '900' });
    return { seller, buyer, book, lamp, calc };
  }

  it('shows active listings, newest first, to any signed-in student', async () => {
    const { buyer, book, lamp, calc } = await seed();
    const res = await buyer.agent.get('/api/listings').expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.listings.map((l) => l.id)).toEqual([calc.id, lamp.id, book.id]);
    expect(res.body.listings[0].seller.name).toBe('Rohan Mehta');
  });

  it('hides listings that are removed, deleted, sold, or in an ended auction', async () => {
    const { buyer, book, lamp, calc } = await seed();
    await pool.query("UPDATE listings SET status = 'removed' WHERE id = ?", [book.id]);
    await pool.query("UPDATE listings SET status = 'sold' WHERE id = ?", [lamp.id]);
    await pool.query("UPDATE listings SET status = 'in_auction' WHERE id = ?", [calc.id]);
    await pool.query(
      `INSERT INTO auctions (listing_id, starting_price, bid_increment, start_time, end_time, status)
       VALUES (?, 500, 50, UTC_TIMESTAMP() - INTERVAL 2 DAY, UTC_TIMESTAMP() - INTERVAL 1 HOUR, 'active')`,
      [calc.id],
    );
    const res = await buyer.agent.get('/api/listings').expect(200);
    expect(res.body.total).toBe(0);
  });

  it('shows a listing in an open auction at its current bid', async () => {
    const { buyer, calc } = await seed();
    await pool.query("UPDATE listings SET status = 'in_auction' WHERE id = ?", [calc.id]);
    await pool.query(
      `INSERT INTO auctions (listing_id, starting_price, bid_increment, start_time, end_time, current_bid)
       VALUES (?, 500, 50, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1200)`,
      [calc.id],
    );
    const res = await buyer.agent.get('/api/listings').query({ sort: 'price_desc' }).expect(200);
    expect(res.body.listings[0]).toMatchObject({ id: calc.id, auction: { status: 'active', currentBid: 1200 } });
    const filtered = await buyer.agent.get('/api/listings').query({ min: '1000' }).expect(200);
    expect(filtered.body.listings.map((l) => l.id)).toEqual([calc.id]);
  });

  it('searches every word in the title and description', async () => {
    const { buyer, book } = await seed();
    const res = await buyer.agent.get('/api/listings').query({ q: 'grewal BOOK' }).expect(200);
    expect(res.body.listings.map((l) => l.id)).toEqual([book.id]);
    const none = await buyer.agent.get('/api/listings').query({ q: 'bicycle' }).expect(200);
    expect(none.body.total).toBe(0);
  });

  it('treats % and _ in a search as plain characters', async () => {
    const { buyer } = await seed();
    const res = await buyer.agent.get('/api/listings').query({ q: '%' }).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('filters by category, conditions and price range, and sorts by price', async () => {
    const { buyer, book, lamp, calc } = await seed();
    const byCategory = await buyer.agent.get('/api/listings').query({ category: '3' }).expect(200);
    expect(byCategory.body.listings.map((l) => l.id)).toEqual([lamp.id]);
    const byCondition = await buyer.agent.get('/api/listings').query({ condition: 'good,new' }).expect(200);
    expect(byCondition.body.listings.map((l) => l.id).sort()).toEqual([book.id, lamp.id].sort());
    const byPrice = await buyer.agent.get('/api/listings').query({ min: '500', max: '900', sort: 'price_asc' }).expect(200);
    expect(byPrice.body.listings.map((l) => l.id)).toEqual([lamp.id, calc.id]);
  });

  it('rejects invalid filters', async () => {
    const { buyer } = await seed();
    await buyer.agent.get('/api/listings').query({ condition: 'mint' }).expect(400);
    await buyer.agent.get('/api/listings').query({ min: '900', max: '100' }).expect(400);
    await buyer.agent.get('/api/listings').query({ sort: 'random' }).expect(400);
    await buyer.agent.get('/api/listings').query({ min: '-1' }).expect(400);
  });

  it('pages results', async () => {
    const { seller, buyer } = await seed();
    for (let i = 0; i < 24; i += 1) await postListing(seller.agent, { title: `Extra item ${i}` }).expect(201);
    const first = await buyer.agent.get('/api/listings').expect(200);
    expect(first.body).toMatchObject({ total: 27, pageSize: 24, page: 1 });
    expect(first.body.listings).toHaveLength(24);
    const second = await buyer.agent.get('/api/listings').query({ page: '2' }).expect(200);
    expect(second.body.listings).toHaveLength(3);
  });

  it('shows details with all photos and the seller rating', async () => {
    const { seller, buyer } = await seed();
    const created = (await postListing(seller.agent, {}, [png(), jpg()]).expect(201)).body.listing;
    await pool.query('INSERT INTO reviews (reviewer_id, reviewee_id, rating) VALUES (?, ?, 4), (?, ?, 5)', [
      buyer.user.id, seller.user.id, buyer.user.id, seller.user.id,
    ]);
    const res = await buyer.agent.get(`/api/listings/${created.id}`).expect(200);
    expect(res.body.listing.images).toHaveLength(2);
    expect(res.body.listing.seller).toMatchObject({ name: 'Rohan Mehta', averageRating: 4.5, reviewsCount: 2 });
  });

  it("hides a suspended student's listings while suspended and shows them again after reactivation", async () => {
    const { seller, buyer, book } = await seed();
    await pool.query("UPDATE users SET account_status = 'suspended' WHERE id = ?", [seller.user.id]);
    expect((await buyer.agent.get('/api/listings').expect(200)).body.total).toBe(0);
    await buyer.agent.get(`/api/listings/${book.id}`).expect(404);
    expect((await request(app).get('/api/public/home').expect(200)).body.listings).toHaveLength(0);
    await pool.query("UPDATE users SET account_status = 'active' WHERE id = ?", [seller.user.id]);
    expect((await buyer.agent.get('/api/listings').expect(200)).body.total).toBe(3);
    await buyer.agent.get(`/api/listings/${book.id}`).expect(200);
  });

  it('hides unavailable listings from other students but not from their seller', async () => {
    const { seller, buyer, book } = await seed();
    await pool.query("UPDATE listings SET status = 'removed' WHERE id = ?", [book.id]);
    await buyer.agent.get(`/api/listings/${book.id}`).expect(404);
    await seller.agent.get(`/api/listings/${book.id}`).expect(200);
    await buyer.agent.get('/api/listings/999999').expect(404);
    await buyer.agent.get('/api/listings/abc').expect(400);
  });
});

describe('Edit and delete listings', () => {
  it("lets only the seller edit, and only while it's active", async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const other = await createUser({ email: 'other@uni.test' });
    const { listing } = (await postListing(seller.agent).expect(201)).body;

    await putListing(other.agent, listing.id, { title: 'Hijacked' }).expect(403);
    const res = await putListing(seller.agent, listing.id, { title: 'Casio calculator (with box)', price: '850.50' }).expect(200);
    expect(res.body.listing).toMatchObject({ title: 'Casio calculator (with box)', price: 850.5 });

    await pool.query("UPDATE listings SET status = 'in_auction' WHERE id = ?", [listing.id]);
    await putListing(seller.agent, listing.id).expect(409);
  });

  it('keeps chosen photos, adds new ones and deletes removed files', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const { listing } = (await postListing(seller.agent, {}, [png('a.png'), jpg('b.jpg')]).expect(201)).body;
    const [first, second] = listing.images;

    const res = await putListing(seller.agent, listing.id, { keepImageIds: String(first.id) }, [png('c.png')]).expect(200);
    const { images } = res.body.listing;
    expect(images).toHaveLength(2);
    expect(images[0].id).toBe(first.id);
    expect(images.map((i) => i.id)).not.toContain(second.id);
    expect(onDisk(first.url)).toBe(true);
    expect(onDisk(second.url)).toBe(false);
    expect(onDisk(images[1].url)).toBe(true);
  });

  it('rejects keeping a photo from another listing or going over 5 photos', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const a = (await postListing(seller.agent, {}, [png()]).expect(201)).body.listing;
    const b = (await postListing(seller.agent, {}, [png(), png(), png()]).expect(201)).body.listing;
    await putListing(seller.agent, a.id, { keepImageIds: String(b.images[0].id) }).expect(400);
    const res = await putListing(seller.agent, b.id, {}, [png(), png(), png()]).expect(400);
    expect(res.body.details[0].message).toMatch(/at most 5/);
  });

  it('marks a deleted listing as deleted and hides it everywhere', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const other = await createUser({ email: 'other@uni.test' });
    const { listing } = (await postListing(seller.agent).expect(201)).body;

    await other.agent.delete(`/api/listings/${listing.id}`).expect(403);
    await seller.agent.delete(`/api/listings/${listing.id}`).expect(204);
    const [[row]] = await pool.query('SELECT status FROM listings WHERE id = ?', [listing.id]);
    expect(row.status).toBe('deleted');
    await seller.agent.get(`/api/listings/${listing.id}`).expect(404);
    await seller.agent.delete(`/api/listings/${listing.id}`).expect(404);
    const mine = await seller.agent.get('/api/listings/mine').expect(200);
    expect(mine.body.listings).toHaveLength(0);
  });

  it("lists the seller's own listings including ones that are not available", async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const a = (await postListing(seller.agent, { title: 'First item' }).expect(201)).body.listing;
    await postListing(seller.agent, { title: 'Second item' }).expect(201);
    await pool.query("UPDATE listings SET status = 'removed' WHERE id = ?", [a.id]);
    const res = await seller.agent.get('/api/listings/mine').expect(200);
    expect(res.body.listings.map((l) => l.title)).toEqual(['Second item', 'First item']);
  });
});
