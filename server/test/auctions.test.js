import request from 'supertest';
import { io as connectSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { closeRealtime, initRealtime } from '../src/realtime.js';
import { settleDueAuctions } from '../src/auctions/settle.js';
import { app, createUser, insertListing, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

const start = (agent, body) => agent.post('/api/auctions').send(body);
const bid = (agent, auctionId, amount) => agent.post(`/api/auctions/${auctionId}/bids`).send({ amount });

async function setup({ startingPrice = '1000', bidIncrement = '100', durationHours = 24 } = {}) {
  const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
  const alice = await createUser({ email: 'alice@uni.test', name: 'Alice Kumar' });
  const bob = await createUser({ email: 'bob@uni.test', name: 'Bob Singh' });
  const listingId = await insertListing(seller.user.id, { title: 'Dell monitor', price: 5000 });
  const res = await start(seller.agent, { listingId, startingPrice, bidIncrement, durationHours }).expect(201);
  return { seller, alice, bob, listingId, auction: res.body.auction };
}

// Moves an auction into the past (start time too, so end_time > start_time still holds).
const endNow = (auctionId) =>
  pool.query(
    'UPDATE auctions SET start_time = UTC_TIMESTAMP() - INTERVAL 1 DAY, end_time = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE id = ?',
    [auctionId],
  );

describe('UC-07/UC-08 Start Auction and Set Auction Details', () => {
  it('requires sign-in', async () => {
    await request(app).get('/api/auctions').expect(401);
    await request(app).post('/api/auctions').send({}).expect(401);
  });

  it('starts an auction with server-set times and moves the listing into the auction', async () => {
    const { auction, listingId } = await setup({ durationHours: 6 });
    expect(auction).toMatchObject({ status: 'active', startingPrice: 1000, bidIncrement: 100, currentBid: null, minimumBid: 1000, isSeller: true, bidCount: 0 });
    const [[row]] = await pool.query(
      'SELECT TIMESTAMPDIFF(MINUTE, start_time, end_time) AS minutes, ABS(TIMESTAMPDIFF(SECOND, start_time, UTC_TIMESTAMP())) AS age FROM auctions WHERE id = ?',
      [auction.id],
    );
    expect(Number(row.minutes)).toBe(360);
    expect(Number(row.age)).toBeLessThan(10);
    const [[listing]] = await pool.query('SELECT status FROM listings WHERE id = ?', [listingId]);
    expect(listing.status).toBe('in_auction');
  });

  it('ignores an end time sent by the browser', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const listingId = await insertListing(seller.user.id);
    const res = await start(seller.agent, { listingId, startingPrice: '100', bidIncrement: '10', durationHours: 1, endTime: '2099-01-01T00:00:00Z' }).expect(201);
    const [[row]] = await pool.query('SELECT TIMESTAMPDIFF(MINUTE, start_time, end_time) AS minutes FROM auctions WHERE id = ?', [res.body.auction.id]);
    expect(Number(row.minutes)).toBe(60);
  });

  it('validates starting price, increment and duration', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const listingId = await insertListing(seller.user.id);
    const res = await start(seller.agent, { listingId, startingPrice: '0', bidIncrement: '1.234', durationHours: 5 }).expect(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['bidIncrement', 'durationHours', 'startingPrice']);
  });

  it('does not allow a starting price above the listed price', async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const listingId = await insertListing(seller.user.id, { price: 120 });
    const res = await start(seller.agent, { listingId, startingPrice: '120.01', bidIncrement: '5', durationHours: 1 }).expect(400);
    expect(res.body.details[0]).toMatchObject({ field: 'startingPrice' });
    expect(res.body.details[0].message).toContain('₹120');
    const [rows] = await pool.query('SELECT id FROM auctions');
    expect(rows).toHaveLength(0);
    await start(seller.agent, { listingId, startingPrice: '120', bidIncrement: '5', durationHours: 1 }).expect(201);
  });

  it("only auctions the seller's own active listing, once", async () => {
    const seller = await createUser({ email: 'seller@uni.test' });
    const other = await createUser({ email: 'other@uni.test' });
    const listingId = await insertListing(seller.user.id);
    const body = { listingId, startingPrice: '100', bidIncrement: '10', durationHours: 1 };
    await start(other.agent, body).expect(403);
    await start(seller.agent, body).expect(201);
    await start(seller.agent, body).expect(409);
    const removed = await insertListing(seller.user.id, { status: 'removed' });
    await start(seller.agent, { ...body, listingId: removed }).expect(404);
  });

  it('blocks editing the listing once it is in an auction', async () => {
    const { seller, listingId } = await setup();
    await seller.agent.delete(`/api/listings/${listingId}`).expect(409);
  });
});

describe('UC-09 Place Bid', () => {
  it('requires the first bid to reach the starting price and later bids to add the increment', async () => {
    const { alice, bob, auction } = await setup();
    const low = await bid(alice.agent, auction.id, '999').expect(409);
    expect(low.body.details[0]).toMatchObject({ field: 'amount' });
    const first = await bid(alice.agent, auction.id, '1000').expect(201);
    expect(first.body.auction).toMatchObject({ currentBid: 1000, minimumBid: 1100, iAmHighest: true, bidCount: 1 });
    await bid(bob.agent, auction.id, '1099.99').expect(409);
    const second = await bid(bob.agent, auction.id, 1100).expect(201);
    expect(second.body.auction).toMatchObject({ currentBid: 1100, iAmHighest: true });
    const aliceView = await alice.agent.get(`/api/auctions/${auction.id}`).expect(200);
    expect(aliceView.body.auction.iAmHighest).toBe(false);
  });

  it('accepts amounts with paise exactly at the minimum', async () => {
    const { alice, auction } = await setup({ startingPrice: '10.10', bidIncrement: '0.20' });
    await bid(alice.agent, auction.id, '10.10').expect(201);
    await bid(alice.agent, auction.id, '10.29').expect(409);
    await bid(alice.agent, auction.id, '10.30').expect(201);
  });

  it.each(['0', '-5', '12.345', 'abc', '', '10000001'])('rejects the amount %s', async (amount) => {
    const { alice, auction } = await setup();
    const res = await bid(alice.agent, auction.id, amount).expect(400);
    expect(res.body.details[0].field).toBe('amount');
  });

  it('does not let the seller bid', async () => {
    const { seller, auction } = await setup();
    await bid(seller.agent, auction.id, '5000').expect(403);
  });

  it('rejects a bid that arrives after the server-side end time', async () => {
    const { alice, auction } = await setup();
    await endNow(auction.id);
    const res = await bid(alice.agent, auction.id, '5000').expect(409);
    expect(res.body.error).toMatch(/already ended/);
    const [rows] = await pool.query('SELECT id FROM bids');
    expect(rows).toHaveLength(0);
  });

  it('returns 404 for an unknown auction', async () => {
    const { alice } = await setup();
    await bid(alice.agent, 999999, '100').expect(404);
    await alice.agent.get('/api/auctions/999999').expect(404);
  });

  it('accepts exactly one of several simultaneous bids for the same amount', async () => {
    const { auction } = await setup();
    const bidders = [];
    for (let i = 0; i < 8; i += 1) bidders.push(await createUser({ email: `bidder${i}@uni.test` }));
    const results = await Promise.all(bidders.map((b) => bid(b.agent, auction.id, '1000')));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    const [bids] = await pool.query('SELECT bidder_id, amount FROM bids WHERE auction_id = ?', [auction.id]);
    expect(bids).toHaveLength(1);
    const [[row]] = await pool.query('SELECT current_bid, current_bidder_id FROM auctions WHERE id = ?', [auction.id]);
    expect(Number(row.current_bid)).toBe(1000);
    expect(Number(row.current_bidder_id)).toBe(Number(bids[0].bidder_id));
  });

  it('keeps every accepted bid valid against the bid before it under concurrent bidding', async () => {
    const { auction } = await setup();
    const bidders = [];
    for (let i = 0; i < 6; i += 1) bidders.push(await createUser({ email: `racer${i}@uni.test` }));
    // Everyone bids at once with amounts that only some orderings allow.
    const amounts = ['1000', '1100', '1100', '1250', '1200', '1300'];
    await Promise.all(bidders.map((b, i) => bid(b.agent, auction.id, amounts[i])));
    const [bids] = await pool.query('SELECT amount, bidder_id FROM bids WHERE auction_id = ? ORDER BY id', [auction.id]);
    expect(bids.length).toBeGreaterThan(0);
    expect(Number(bids[0].amount)).toBeGreaterThanOrEqual(1000);
    for (let i = 1; i < bids.length; i += 1) {
      expect(Number(bids[i].amount)).toBeGreaterThanOrEqual(Number(bids[i - 1].amount) + 100);
    }
    const last = bids.at(-1);
    const [[row]] = await pool.query('SELECT current_bid, current_bidder_id FROM auctions WHERE id = ?', [auction.id]);
    expect(Number(row.current_bid)).toBe(Number(last.amount));
    expect(Number(row.current_bidder_id)).toBe(Number(last.bidder_id));
  });

  it('shows bidder names to the seller and to each bidder for their own bids only', async () => {
    const { seller, alice, bob, auction } = await setup();
    await bid(alice.agent, auction.id, '1000').expect(201);
    await bid(bob.agent, auction.id, '1100').expect(201);
    const sellerView = (await seller.agent.get(`/api/auctions/${auction.id}`).expect(200)).body.auction;
    expect(sellerView.bids.map((b) => b.bidderName)).toEqual(['Bob Singh', 'Alice Kumar']);
    const aliceView = (await alice.agent.get(`/api/auctions/${auction.id}`).expect(200)).body.auction;
    expect(aliceView.bids[0].bidderName).not.toContain('Bob');
    expect(aliceView.bids[1]).toMatchObject({ bidderName: 'Alice Kumar', isMine: true });
  });
});

describe('ending auctions and winner notifications', () => {
  it('ends a due auction, records the highest bidder as winner and notifies only them', async () => {
    const { seller, alice, bob, auction } = await setup();
    await bid(alice.agent, auction.id, '1000').expect(201);
    await bid(bob.agent, auction.id, '1500').expect(201);
    await endNow(auction.id);

    expect(await settleDueAuctions()).toBe(1);
    expect(await settleDueAuctions()).toBe(0); // Idempotent.
    const [[row]] = await pool.query('SELECT status, winner_id FROM auctions WHERE id = ?', [auction.id]);
    expect(row.status).toBe('ended');
    expect(Number(row.winner_id)).toBe(bob.user.id);
    const [[listing]] = await pool.query('SELECT status FROM listings WHERE id = ?', [auction.listingId]);
    expect(listing.status).toBe('sold');

    const bobView = (await bob.agent.get(`/api/auctions/${auction.id}`).expect(200)).body.auction;
    expect(bobView).toMatchObject({ status: 'ended', isWinner: true, currentBid: 1500 });
    expect((await bob.agent.get('/api/notifications/unread-count').expect(200)).body.count).toBe(1);
    const list = (await bob.agent.get('/api/notifications').expect(200)).body.notifications;
    expect(list[0]).toMatchObject({ type: 'auction_won', auctionId: auction.id });
    expect(list[0].message).toContain('₹1,500');
    expect((await alice.agent.get('/api/notifications').expect(200)).body.notifications).toHaveLength(0);
    expect((await seller.agent.get('/api/notifications').expect(200)).body.notifications).toHaveLength(0);

    await bob.agent.post('/api/notifications/read-all').expect(204);
    expect((await bob.agent.get('/api/notifications/unread-count').expect(200)).body.count).toBe(0);
  });

  it('ends an auction with no bids without a winner and puts the listing back on sale', async () => {
    const { seller, auction } = await setup();
    await endNow(auction.id);
    await settleDueAuctions();
    const [[row]] = await pool.query('SELECT status, winner_id FROM auctions WHERE id = ?', [auction.id]);
    expect(row).toMatchObject({ status: 'ended', winner_id: null });
    const [notes] = await pool.query('SELECT id FROM notifications');
    expect(notes).toHaveLength(0);
    // Approved rule: with no bids the listing goes back on sale and can be edited or auctioned again.
    const [[listing]] = await pool.query('SELECT status FROM listings WHERE id = ?', [auction.listingId]);
    expect(listing.status).toBe('active');
    await start(seller.agent, { listingId: auction.listingId, startingPrice: '800', bidIncrement: '50', durationHours: 1 }).expect(201);
  });

  it('settles an overdue auction when it is viewed', async () => {
    const { alice, auction } = await setup();
    await bid(alice.agent, auction.id, '1000').expect(201);
    await endNow(auction.id);
    const view = (await alice.agent.get(`/api/auctions/${auction.id}`).expect(200)).body.auction;
    expect(view).toMatchObject({ status: 'ended', isWinner: true });
  });

  it('lists live and ended auctions separately', async () => {
    const { alice, auction } = await setup();
    const live = (await alice.agent.get('/api/auctions').expect(200)).body.auctions;
    expect(live.map((a) => a.id)).toEqual([auction.id]);
    expect(live[0].listing.title).toBe('Dell monitor');
    await endNow(auction.id);
    expect((await alice.agent.get('/api/auctions').expect(200)).body.auctions).toHaveLength(0);
    const ended = (await alice.agent.get('/api/auctions').query({ status: 'ended' }).expect(200)).body.auctions;
    expect(ended.map((a) => a.id)).toEqual([auction.id]);
  });
});

describe('real-time updates', () => {
  let server;
  let port;
  const sockets = [];

  beforeEach(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
    initRealtime(server);
  });

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.close();
    await closeRealtime();
  });

  async function cookieFor(email, password) {
    const res = await request(app).post('/api/auth/sign-in').send({ email, password }).expect(200);
    return res.headers['set-cookie'][0].split(';')[0];
  }

  function connect(cookie) {
    const socket = connectSocket(`http://localhost:${port}`, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, reconnection: false });
    sockets.push(socket);
    return socket;
  }

  it('refuses connections without a valid session', async () => {
    const socket = connect(null);
    const error = await new Promise((resolve) => socket.once('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('broadcasts a bid to watchers only after it is saved', async () => {
    const { alice, bob, auction } = await setup();
    const socket = connect(await cookieFor('bob@uni.test', bob.password));
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.emit('auction:watch', auction.id);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const received = new Promise((resolve) => {
      socket.once('auction:changed', async (payload) => {
        const [[row]] = await pool.query('SELECT current_bid FROM auctions WHERE id = ?', [auction.id]);
        resolve({ payload, savedBid: Number(row.current_bid) });
      });
    });
    await bid(alice.agent, auction.id, '1000').expect(201);
    const { payload, savedBid } = await received;
    expect(payload).toEqual({ auctionId: auction.id });
    expect(savedBid).toBe(1000);
  });

  it('tells the winner to refresh notifications when an auction ends', async () => {
    const { alice, auction } = await setup();
    await bid(alice.agent, auction.id, '1000').expect(201);
    const socket = connect(await cookieFor('alice@uni.test', alice.password));
    await new Promise((resolve) => socket.once('connect', resolve));
    const notified = new Promise((resolve) => socket.once('notifications:changed', resolve));
    await endNow(auction.id);
    await settleDueAuctions();
    await notified;
  });
});
