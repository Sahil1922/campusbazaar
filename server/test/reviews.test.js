import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, createUser, insertListing, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

async function setup() {
  const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
  const buyer = await createUser({ email: 'buyer@uni.test', name: 'Priya Sharma' });
  const listingId = await insertListing(seller.user.id);
  return { seller, buyer, listingId };
}

describe('UC-06 Rate and Review', () => {
  it('requires sign-in', async () => {
    await request(app).get('/api/users/1/reviews').expect(401);
    await request(app).post('/api/reviews').send({}).expect(401);
  });

  it("adds a review of a listing's seller and lists it", async () => {
    const { seller, buyer, listingId } = await setup();
    const res = await buyer.agent
      .post('/api/reviews')
      .send({ revieweeId: seller.user.id, listingId, rating: 4, comment: ' Friendly and on time. ' })
      .expect(201);
    expect(res.body.review).toMatchObject({ rating: 4, comment: 'Friendly and on time.', reviewerName: 'Priya Sharma', isMine: true });

    const list = await seller.agent.get(`/api/users/${seller.user.id}/reviews`).expect(200);
    expect(list.body.reviews).toEqual([expect.objectContaining({ rating: 4, reviewerName: 'Priya Sharma', isMine: false })]);
    const profile = await seller.agent.get('/api/profile').expect(200);
    expect(profile.body.activity).toMatchObject({ reviewsReceived: 1, averageRating: 4 });
  });

  it('allows only one review per seller per listing', async () => {
    const { seller, buyer, listingId } = await setup();
    const body = { revieweeId: seller.user.id, listingId, rating: 5 };
    await buyer.agent.post('/api/reviews').send(body).expect(201);
    await buyer.agent.post('/api/reviews').send({ ...body, rating: 1 }).expect(409);
    const other = await insertListing(seller.user.id, { title: 'Another item' });
    await buyer.agent.post('/api/reviews').send({ ...body, listingId: other }).expect(201);
  });

  it('does not allow reviewing yourself', async () => {
    const { seller, listingId } = await setup();
    await seller.agent.post('/api/reviews').send({ revieweeId: seller.user.id, listingId, rating: 5 }).expect(403);
  });

  it('only reviews the seller of the given listing', async () => {
    const { seller, buyer } = await setup();
    const third = await createUser({ email: 'third@uni.test' });
    const buyersListing = await insertListing(third.user.id);
    await buyer.agent.post('/api/reviews').send({ revieweeId: seller.user.id, listingId: buyersListing, rating: 5 }).expect(400);
    await buyer.agent.post('/api/reviews').send({ revieweeId: seller.user.id, listingId: 999999, rating: 5 }).expect(404);
  });

  it.each([0, 6, 3.5, 'five', null])('rejects the rating %s', async (rating) => {
    const { seller, buyer, listingId } = await setup();
    const res = await buyer.agent.post('/api/reviews').send({ revieweeId: seller.user.id, listingId, rating }).expect(400);
    expect(res.body.details[0].field).toBe('rating');
  });

  it('rejects a comment over 1000 characters', async () => {
    const { seller, buyer, listingId } = await setup();
    await buyer.agent.post('/api/reviews').send({ revieweeId: seller.user.id, listingId, rating: 3, comment: 'x'.repeat(1001) }).expect(400);
  });

  it('returns 404 for reviews of a student who does not exist', async () => {
    const { buyer } = await setup();
    await buyer.agent.get('/api/users/999999/reviews').expect(404);
  });
});
