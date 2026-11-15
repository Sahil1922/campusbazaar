import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, createUser, makeAdmin, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

async function setup() {
  const admin = await createUser({ email: 'admin@uni.test', name: 'Admin Person' });
  await makeAdmin(admin.user.id);
  const student = await createUser({ email: 'student@uni.test', name: 'Priya Sharma' });
  return { admin, student };
}

describe('UC-12 Manage Users — authorization', () => {
  it('requires sign-in', async () => {
    await request(app).get('/api/admin/users').expect(401);
  });

  it('refuses a signed-in student who is not an administrator', async () => {
    const { student } = await setup();
    await student.agent.get('/api/admin/users').expect(403);
    await student.agent.patch(`/api/admin/users/${student.user.id}/status`).send({ status: 'suspended' }).expect(403);
  });

  it('stops working as soon as the admin role is removed', async () => {
    const { admin } = await setup();
    await admin.agent.get('/api/admin/users').expect(200);
    await pool.query("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'", [admin.user.id]);
    await admin.agent.get('/api/admin/users').expect(403);
  });
});

describe('UC-12 Manage Users — listing users', () => {
  it('lists users with their roles', async () => {
    const { admin } = await setup();
    const res = await admin.agent.get('/api/admin/users').expect(200);
    expect(res.body.total).toBe(2);
    const priya = res.body.users.find((u) => u.email === 'student@uni.test');
    expect(priya).toMatchObject({ name: 'Priya Sharma', accountStatus: 'active', roles: ['buyer', 'seller'] });
    const adminRow = res.body.users.find((u) => u.email === 'admin@uni.test');
    // Roles are ordered as declared in the user_roles ENUM.
    expect(adminRow.roles).toEqual(['buyer', 'seller', 'admin']);
  });

  it('filters by name or email and by status', async () => {
    const { admin } = await setup();
    const byName = await admin.agent.get('/api/admin/users').query({ search: 'priya' }).expect(200);
    expect(byName.body.users.map((u) => u.email)).toEqual(['student@uni.test']);
    const suspended = await admin.agent.get('/api/admin/users').query({ status: 'suspended' }).expect(200);
    expect(suspended.body.total).toBe(0);
  });

  it('treats % and _ in the search as plain characters', async () => {
    const { admin } = await setup();
    const res = await admin.agent.get('/api/admin/users').query({ search: '%' }).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('rejects an invalid status filter', async () => {
    const { admin } = await setup();
    await admin.agent.get('/api/admin/users').query({ status: 'deleted' }).expect(400);
  });
});

describe('UC-12 Manage Users — suspend and reactivate', () => {
  it('suspends a user, records the action, and blocks their session', async () => {
    const { admin, student } = await setup();
    const res = await admin.agent
      .patch(`/api/admin/users/${student.user.id}/status`)
      .send({ status: 'suspended', note: 'Fake listings' })
      .expect(200);
    expect(res.body.user.accountStatus).toBe('suspended');

    const [actions] = await pool.query('SELECT admin_id, action_type, target_type, target_id, note FROM admin_actions');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action_type: 'suspend_user', target_type: 'user', note: 'Fake listings' });
    expect(Number(actions[0].admin_id)).toBe(admin.user.id);
    expect(Number(actions[0].target_id)).toBe(student.user.id);

    await student.agent.get('/api/profile').expect(403);
  });

  it('reactivates a suspended user', async () => {
    const { admin, student } = await setup();
    await admin.agent.patch(`/api/admin/users/${student.user.id}/status`).send({ status: 'suspended' }).expect(200);
    await admin.agent.patch(`/api/admin/users/${student.user.id}/status`).send({ status: 'active' }).expect(200);
    await student.agent.post('/api/auth/sign-in').send({ email: 'student@uni.test', password: student.password }).expect(200);
    const [actions] = await pool.query('SELECT action_type FROM admin_actions ORDER BY id');
    expect(actions.map((a) => a.action_type)).toEqual(['suspend_user', 'reactivate_user']);
  });

  it('records nothing when the status is already the requested one', async () => {
    const { admin, student } = await setup();
    await admin.agent.patch(`/api/admin/users/${student.user.id}/status`).send({ status: 'active' }).expect(200);
    const [actions] = await pool.query('SELECT id FROM admin_actions');
    expect(actions).toHaveLength(0);
  });

  it('does not let an admin change their own status', async () => {
    const { admin } = await setup();
    await admin.agent.patch(`/api/admin/users/${admin.user.id}/status`).send({ status: 'suspended' }).expect(400);
  });

  it('does not let an admin suspend another administrator', async () => {
    const { admin } = await setup();
    const other = await createUser({ email: 'admin2@uni.test' });
    await makeAdmin(other.user.id);
    await admin.agent.patch(`/api/admin/users/${other.user.id}/status`).send({ status: 'suspended' }).expect(403);
    const [[row]] = await pool.query('SELECT account_status FROM users WHERE id = ?', [other.user.id]);
    expect(row.account_status).toBe('active');
  });

  it('returns 404 for a user that does not exist', async () => {
    const { admin } = await setup();
    await admin.agent.patch('/api/admin/users/999999/status').send({ status: 'suspended' }).expect(404);
  });

  it('rejects an invalid status or user id', async () => {
    const { admin, student } = await setup();
    await admin.agent.patch(`/api/admin/users/${student.user.id}/status`).send({ status: 'banned' }).expect(400);
    await admin.agent.patch('/api/admin/users/abc/status').send({ status: 'suspended' }).expect(400);
  });
});
