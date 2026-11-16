import request from 'supertest';
import { io as connectSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { closeRealtime, initRealtime } from '../src/realtime.js';
import { app, createUser, insertListing, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

async function setup() {
  const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
  const buyer = await createUser({ email: 'buyer@uni.test', name: 'Priya Sharma' });
  const stranger = await createUser({ email: 'stranger@uni.test', name: 'Third Student' });
  const listingId = await insertListing(seller.user.id, { title: 'Grewal maths book' });
  const path = `/api/messages/${listingId}/${buyer.user.id}`;
  return { seller, buyer, stranger, listingId, path };
}

describe('UC-05 Contact Seller / Send Message', () => {
  it('requires sign-in', async () => {
    await request(app).get('/api/messages/conversations').expect(401);
    await request(app).post('/api/messages/1/1').send({ content: 'hi' }).expect(401);
  });

  it('lets a buyer open an empty conversation about an available listing and send the first message', async () => {
    const { buyer, path } = await setup();
    const empty = await buyer.agent.get(path).expect(200);
    expect(empty.body).toMatchObject({ otherName: 'Rohan Mehta', canSend: true, messages: [] });
    const sent = await buyer.agent.post(path).send({ content: '  Is it still available?  ' }).expect(201);
    expect(sent.body.message).toMatchObject({ content: 'Is it still available?', isMine: true });
  });

  it('stores the seller as recipient no matter what the browser sends', async () => {
    const { buyer, seller, stranger, path } = await setup();
    await buyer.agent.post(path).send({ content: 'Hello', recipientId: stranger.user.id }).expect(201);
    const [[row]] = await pool.query('SELECT sender_id, recipient_id FROM messages');
    expect(Number(row.sender_id)).toBe(buyer.user.id);
    expect(Number(row.recipient_id)).toBe(seller.user.id);
  });

  it('lets the seller see and reply, and tracks unread messages', async () => {
    const { buyer, seller, path, listingId } = await setup();
    await buyer.agent.post(path).send({ content: 'Is it still available?' }).expect(201);

    expect((await seller.agent.get('/api/messages/unread-count').expect(200)).body.count).toBe(1);
    const list = await seller.agent.get('/api/messages/conversations').expect(200);
    expect(list.body.conversations).toEqual([
      expect.objectContaining({ listingId, buyerId: buyer.user.id, otherName: 'Priya Sharma', role: 'selling', unread: true }),
    ]);

    const thread = await seller.agent.get(path).expect(200);
    expect(thread.body.messages.map((m) => [m.content, m.isMine])).toEqual([['Is it still available?', false]]);
    expect((await seller.agent.get('/api/messages/unread-count').expect(200)).body.count).toBe(0);

    await seller.agent.post(path).send({ content: 'Yes, meet at the library?' }).expect(201);
    const buyerList = await buyer.agent.get('/api/messages/conversations').expect(200);
    expect(buyerList.body.conversations[0]).toMatchObject({
      role: 'buying',
      otherName: 'Rohan Mehta',
      unread: true,
      lastMessage: { content: 'Yes, meet at the library?' },
    });
  });

  it('does not let a seller start a conversation or anyone else read it', async () => {
    const { buyer, seller, stranger, path } = await setup();
    await seller.agent.post(path).send({ content: 'Want to buy my book?' }).expect(403);
    await buyer.agent.post(path).send({ content: 'Hi' }).expect(201);
    await stranger.agent.get(path).expect(403);
    await stranger.agent.post(path).send({ content: 'Let me in' }).expect(403);
  });

  it('does not let a seller message themselves', async () => {
    const { seller, listingId } = await setup();
    await seller.agent.post(`/api/messages/${listingId}/${seller.user.id}`).send({ content: 'Hi me' }).expect(400);
  });

  it('rejects empty and overly long messages', async () => {
    const { buyer, path } = await setup();
    const empty = await buyer.agent.post(path).send({ content: '   ' }).expect(400);
    expect(empty.body.details[0].field).toBe('content');
    await buyer.agent.post(path).send({ content: 'x'.repeat(2001) }).expect(400);
  });

  it('keeps history but blocks sending once the listing is no longer available', async () => {
    const { buyer, seller, path, listingId } = await setup();
    await buyer.agent.post(path).send({ content: 'Hi' }).expect(201);
    await pool.query("UPDATE listings SET status = 'removed' WHERE id = ?", [listingId]);
    const thread = await buyer.agent.get(path).expect(200);
    expect(thread.body.canSend).toBe(false);
    expect(thread.body.messages).toHaveLength(1);
    await buyer.agent.post(path).send({ content: 'Still there?' }).expect(409);
    await seller.agent.post(path).send({ content: 'Sorry' }).expect(409);
  });

  it('does not start conversations about unavailable listings or with suspended sellers', async () => {
    const { buyer, seller, listingId, path } = await setup();
    await pool.query("UPDATE listings SET status = 'sold' WHERE id = ?", [listingId]);
    await buyer.agent.get(path).expect(404);
    await pool.query("UPDATE listings SET status = 'active' WHERE id = ?", [listingId]);
    await pool.query("UPDATE users SET account_status = 'suspended' WHERE id = ?", [seller.user.id]);
    await buyer.agent.post(path).send({ content: 'Hello?' }).expect(409);
  });

  it('returns 404 for a missing listing and 400 for bad ids', async () => {
    const { buyer } = await setup();
    await buyer.agent.get(`/api/messages/999999/${buyer.user.id}`).expect(404);
    await buyer.agent.get('/api/messages/abc/1').expect(400);
  });
});

describe('live message updates (Socket.IO)', () => {
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

  async function connectAs(email, password) {
    const res = await request(app).post('/api/auth/sign-in').send({ email, password }).expect(200);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    const socket = connectSocket(`http://localhost:${port}`, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    sockets.push(socket);
    await new Promise((resolve) => socket.once('connect', resolve));
    return socket;
  }

  it('tells the recipient about a new message only after it is saved', async () => {
    const { buyer, seller, listingId, path } = await setup();
    const sellerSocket = await connectAs('seller@uni.test', seller.password);
    const received = new Promise((resolve) => {
      sellerSocket.once('messages:changed', async (payload) => {
        const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM messages');
        resolve({ payload, saved: Number(row.n) });
      });
    });
    await buyer.agent.post(path).send({ content: 'Is it still available?' }).expect(201);
    const { payload, saved } = await received;
    expect(payload).toEqual({ listingId, buyerId: buyer.user.id });
    expect(saved).toBe(1);
  });

  it('does not tell students who are not in the conversation', async () => {
    const { buyer, stranger, path } = await setup();
    const strangerSocket = await connectAs('stranger@uni.test', stranger.password);
    const heard = vi.fn();
    strangerSocket.on('messages:changed', heard);
    await buyer.agent.post(path).send({ content: 'Hello' }).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(heard).not.toHaveBeenCalled();
  });

  it("updates the reader's other tabs when they read new messages", async () => {
    const { buyer, seller, path } = await setup();
    await buyer.agent.post(path).send({ content: 'Hi' }).expect(201);
    const otherTab = await connectAs('seller@uni.test', seller.password);
    const changed = new Promise((resolve) => otherTab.once('messages:changed', resolve));
    await seller.agent.get(path).expect(200);
    await changed;
  });
});
