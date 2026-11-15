import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, captureEmails, createUser, resetDatabase, tokenFromEmail } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

describe('registration with university email verification', () => {
  it('rejects an email outside the allowed university domains', async () => {
    const sent = captureEmails();
    const res = await request(app).post('/api/auth/register').send({ email: 'someone@gmail.com' }).expect(400);
    expect(res.body.details[0].message).toMatch(/university email/i);
    expect(sent).toHaveLength(0);
  });

  it('rejects a lookalike domain that only ends with an allowed domain', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@evil-uni.test' }).expect(400);
  });

  it('sends a verification link and creates no account until the link is used', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: '  New.Student@UNI.test ' }).expect(202);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('new.student@uni.test');
    expect(sent[0].text).toContain('http://localhost:5173/verify-email?token=');
    const [users] = await pool.query('SELECT id FROM users');
    expect(users).toHaveLength(0);
  });

  it('stores only a hash of the verification token', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'hash@uni.test' }).expect(202);
    const token = tokenFromEmail(sent[0]);
    const [rows] = await pool.query('SELECT token_hash FROM email_verifications');
    expect(rows[0].token_hash).toHaveLength(64);
    expect(rows[0].token_hash).not.toBe(token);
  });

  it('creates a verified account with buyer and seller roles and signs the user in', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'asha@uni.test' }).expect(202);
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/complete-registration')
      .send({ token: tokenFromEmail(sent[0]), name: 'Asha', password: 'a-strong-password' })
      .expect(201);
    expect(res.body.user).toMatchObject({ name: 'Asha', email: 'asha@uni.test', roles: ['buyer', 'seller'] });
    expect(res.body.user).not.toHaveProperty('password_hash');

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('asha@uni.test');

    const [[row]] = await pool.query('SELECT password_hash, email_verified_at FROM users');
    expect(row.password_hash).not.toContain('a-strong-password');
    expect(row.email_verified_at).not.toBeNull();
  });

  it('does not accept a verification link twice', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'once@uni.test' }).expect(202);
    const body = { token: tokenFromEmail(sent[0]), name: 'Once', password: 'a-strong-password' };
    await request(app).post('/api/auth/complete-registration').send(body).expect(201);
    await request(app).post('/api/auth/complete-registration').send(body).expect(400);
  });

  it('rejects an expired verification link', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'late@uni.test' }).expect(202);
    await pool.query('UPDATE email_verifications SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE');
    const res = await request(app)
      .post('/api/auth/complete-registration')
      .send({ token: tokenFromEmail(sent[0]), name: 'Late', password: 'a-strong-password' })
      .expect(400);
    expect(res.body.error).toMatch(/invalid or has expired/i);
  });

  it('rejects a made-up verification token', async () => {
    await request(app)
      .post('/api/auth/complete-registration')
      .send({ token: 'x'.repeat(43), name: 'Nobody', password: 'a-strong-password' })
      .expect(400);
  });

  it('validates name and password when completing registration', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'weak@uni.test' }).expect(202);
    const res = await request(app)
      .post('/api/auth/complete-registration')
      .send({ token: tokenFromEmail(sent[0]), name: 'W', password: 'short' })
      .expect(400);
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'password']));
  });

  it('answers the same for an existing account but sends no email', async () => {
    await createUser({ email: 'taken@uni.test' });
    const sent = captureEmails();
    const res = await request(app).post('/api/auth/register').send({ email: 'taken@uni.test' }).expect(202);
    expect(res.body.message).toMatch(/if this email can be registered/i);
    expect(sent).toHaveLength(0);
  });

  it('does not send another link within the resend cooldown', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'spam@uni.test' }).expect(202);
    await request(app).post('/api/auth/register').send({ email: 'spam@uni.test' }).expect(202);
    expect(sent).toHaveLength(1);
  });

  it('replaces an older unused link when a new one is sent', async () => {
    const sent = captureEmails();
    await request(app).post('/api/auth/register').send({ email: 'again@uni.test' }).expect(202);
    await pool.query('UPDATE email_verifications SET created_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE');
    await request(app).post('/api/auth/register').send({ email: 'again@uni.test' }).expect(202);
    expect(sent).toHaveLength(2);
    await request(app)
      .post('/api/auth/complete-registration')
      .send({ token: tokenFromEmail(sent[0]), name: 'Again', password: 'a-strong-password' })
      .expect(400);
    await request(app)
      .post('/api/auth/complete-registration')
      .send({ token: tokenFromEmail(sent[1]), name: 'Again', password: 'a-strong-password' })
      .expect(201);
  });
});

describe('sign-in and sessions', () => {
  it('signs in with the correct password', async () => {
    const { password } = await createUser({ email: 'ravi@uni.test' });
    const agent = request.agent(app);
    await agent.post('/api/auth/sign-in').send({ email: 'RAVI@uni.test', password }).expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await createUser({ email: 'ravi@uni.test' });
    const wrong = await request(app).post('/api/auth/sign-in').send({ email: 'ravi@uni.test', password: 'nope-nope' });
    const unknown = await request(app).post('/api/auth/sign-in').send({ email: 'ghost@uni.test', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('refuses sign-in for a suspended account', async () => {
    const { user, password } = await createUser({ email: 'bad@uni.test' });
    await pool.query("UPDATE users SET account_status = 'suspended' WHERE id = ?", [user.id]);
    const res = await request(app).post('/api/auth/sign-in').send({ email: 'bad@uni.test', password }).expect(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  it('ends the session on sign-out', async () => {
    const { agent } = await createUser({ email: 'bye@uni.test' });
    await agent.post('/api/auth/sign-out').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects a forged session cookie', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'cb_session=not-a-real-token').expect(401);
  });

  it('rejects a malformed JSON body', async () => {
    await request(app)
      .post('/api/auth/sign-in')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
  });
});
