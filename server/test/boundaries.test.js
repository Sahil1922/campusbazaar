import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, captureEmails, createUser, insertListing, resetDatabase, tokenFromEmail } from './helpers.js';

// Boundary-value checks for the limits used in the white box test cases (CampusBazaar Software
// Testing Document, section 3): values just below, at and just above each limit.

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

const fieldsOf = (res) => (res.body.details ?? []).map((d) => d.field);

let emailCount = 0;
/** Requests a fresh verification link and completes registration with the given name and password. */
async function completeWith({ name, password }) {
  const sent = captureEmails();
  emailCount += 1;
  await request(app).post('/api/auth/register').send({ email: `edge${emailCount}@uni.test` }).expect(202);
  return request(app).post('/api/auth/complete-registration').send({ token: tokenFromEmail(sent.at(-1)), name, password });
}

describe('registration boundaries', () => {
  it.each([
    ['2 characters', 'Ab', 201],
    ['100 characters', 'a'.repeat(100), 201],
    ['1 character', 'A', 400],
    ['101 characters', 'a'.repeat(101), 400],
  ])('name of %s', async (_, name, status) => {
    const res = await completeWith({ name, password: 'campus123' });
    expect(res.status).toBe(status);
    if (status === 400) expect(fieldsOf(res)).toEqual(['name']);
  });

  it.each([
    ['8 characters', 'abcdefgh', 201],
    ['72 bytes', 'a'.repeat(72), 201],
    ['7 characters', 'abcdefg', 400],
    ['73 bytes', 'a'.repeat(73), 400],
    ['37 characters but 74 bytes', 'é'.repeat(37), 400],
  ])('password of %s', async (_, password, status) => {
    const res = await completeWith({ name: 'Edge Case', password });
    expect(res.status).toBe(status);
    if (status === 400) expect(fieldsOf(res)).toEqual(['password']);
  });

  it('accepts a university email with capitals and spaces, and names a malformed one', async () => {
    captureEmails();
    await request(app).post('/api/auth/register').send({ email: '  Tester1@UNI.TEST ' }).expect(202);
    const res = await request(app).post('/api/auth/register').send({ email: 'tester1.uni.test' }).expect(400);
    expect(res.body.details[0].message).toBe('Enter a valid email address.');
  });
});

const validListing = {
  title: 'Casio fx-991EX calculator',
  description: 'Works perfectly, comes with cover.',
  categoryId: '6',
  condition: 'like_new',
  price: '900',
};

function postListing(agent, fields) {
  let req = agent.post('/api/listings');
  for (const [key, value] of Object.entries({ ...validListing, ...fields })) req = req.field(key, value);
  return req;
}

describe('listing boundaries', () => {
  it.each([
    ['title', 'abc', 201],
    ['title', 'a'.repeat(120), 201],
    ['title', 'ab', 400],
    ['title', 'a'.repeat(121), 400],
    ['description', 'a'.repeat(10), 201],
    ['description', 'a'.repeat(2000), 201],
    ['description', 'a'.repeat(9), 400],
    ['description', 'a'.repeat(2001), 400],
    ['price', '1', 201],
    ['price', '10.5', 201],
    ['price', '1000000', 201],
    ['price', '0.99', 400],
    ['price', '1000000.01', 400],
  ])('%s of %s', async (field, value, status) => {
    const { agent } = await createUser({ email: 'seller@uni.test' });
    const res = await postListing(agent, { [field]: value });
    expect(res.status).toBe(status);
    if (status === 400) expect(fieldsOf(res)).toEqual([field]);
  });
});

describe('auction amount boundaries', () => {
  it.each([
    ['1', 201],
    ['0.99', 400],
  ])('starting price of ₹%s', async (startingPrice, status) => {
    const { agent, user } = await createUser({ email: 'seller@uni.test' });
    const listingId = await insertListing(user.id, { price: 500 });
    const res = await agent.post('/api/auctions').send({ listingId, startingPrice, bidIncrement: '10', durationHours: 1 });
    expect(res.status).toBe(status);
  });
});
