import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { app, createUser, insertListing, makeAdmin, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

async function setup() {
  const admin = await createUser({ email: 'admin@uni.test', name: 'Admin Person' });
  await makeAdmin(admin.user.id);
  const seller = await createUser({ email: 'seller@uni.test', name: 'Rohan Mehta' });
  const student = await createUser({ email: 'student@uni.test', name: 'Priya Sharma' });
  const listingId = await insertListing(seller.user.id, { title: 'Suspicious phone' });
  return { admin, seller, student, listingId };
}

describe('submitting reports and complaints', () => {
  it('requires sign-in', async () => {
    await request(app).post('/api/reports').send({}).expect(401);
    await request(app).post('/api/complaints').send({}).expect(401);
  });

  it('accepts a report about a listing or a student', async () => {
    const { student, seller, listingId } = await setup();
    await student.agent.post('/api/reports').send({ listingId, reason: 'Fake or misleading', description: 'Stock photo' }).expect(201);
    await student.agent.post('/api/reports').send({ reportedUserId: seller.user.id, reason: 'Spam' }).expect(201);
    const [rows] = await pool.query('SELECT reporter_id, listing_id, reported_user_id, status FROM reports ORDER BY id');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'open' && Number(r.reporter_id) === student.user.id)).toBe(true);
  });

  it('validates reports', async () => {
    const { student, seller, listingId } = await setup();
    const badReason = await student.agent.post('/api/reports').send({ listingId, reason: 'I dislike it' }).expect(400);
    expect(badReason.body.details[0].field).toBe('reason');
    await student.agent.post('/api/reports').send({ reason: 'Spam' }).expect(400);
    await student.agent.post('/api/reports').send({ listingId: 999999, reason: 'Spam' }).expect(404);
    await student.agent.post('/api/reports').send({ reportedUserId: student.user.id, reason: 'Spam' }).expect(400);
    await seller.agent.post('/api/reports').send({ listingId, reason: 'Spam' }).expect(400);
  });

  it('accepts a complaint about a listing and validates it', async () => {
    const { student, seller, listingId } = await setup();
    await student.agent.post('/api/complaints').send({ listingId, reason: 'Seller did not show up' }).expect(201);
    await student.agent.post('/api/complaints').send({ listingId, reason: 'Other reason' }).expect(400);
    await seller.agent.post('/api/complaints').send({ listingId, reason: 'Other' }).expect(400);
  });
});

describe('UC-10 View Reports and UC-11 Handle Complaints (admins)', () => {
  it('is only available to administrators', async () => {
    const { student } = await setup();
    await student.agent.get('/api/admin/reports').expect(403);
    await student.agent.get('/api/admin/complaints').expect(403);
    await student.agent.post('/api/admin/reports/1/resolve').send({}).expect(403);
    await request(app).get('/api/admin/reports').expect(401);
  });

  it('lists open reports with listing and student details', async () => {
    const { admin, student, seller, listingId } = await setup();
    await student.agent.post('/api/reports').send({ listingId, reason: 'Prohibited item' }).expect(201);
    await student.agent.post('/api/reports').send({ reportedUserId: seller.user.id, reason: 'Spam' }).expect(201);
    const res = await admin.agent.get('/api/admin/reports').expect(200);
    expect(res.body.reports).toHaveLength(2);
    const listingReport = res.body.reports.find((r) => r.listing);
    expect(listingReport).toMatchObject({
      reason: 'Prohibited item',
      reporterName: 'Priya Sharma',
      listing: { id: listingId, title: 'Suspicious phone', sellerName: 'Rohan Mehta', status: 'active' },
    });
    expect(res.body.reports.find((r) => !r.listing).reportedUserName).toBe('Rohan Mehta');
    expect((await admin.agent.get('/api/admin/reports').query({ status: 'closed' }).expect(200)).body.reports).toHaveLength(0);
  });

  it('removes the listing and closes the report, recording both actions', async () => {
    const { admin, student, listingId } = await setup();
    await student.agent.post('/api/reports').send({ listingId, reason: 'Prohibited item' }).expect(201);
    const [{ id }] = (await admin.agent.get('/api/admin/reports').expect(200)).body.reports;

    await admin.agent.post(`/api/admin/reports/${id}/resolve`).send({ removeListing: true, note: 'Not allowed' }).expect(204);
    const [[listing]] = await pool.query('SELECT status FROM listings WHERE id = ?', [listingId]);
    expect(listing.status).toBe('removed');
    const [[report]] = await pool.query('SELECT status, reviewed_by FROM reports WHERE id = ?', [id]);
    expect(report.status).toBe('closed');
    expect(Number(report.reviewed_by)).toBe(admin.user.id);
    const [actions] = await pool.query('SELECT action_type, target_type, note FROM admin_actions ORDER BY id');
    expect(actions.map((a) => a.action_type)).toEqual(['remove_listing', 'close_report_removed_listing']);

    await student.agent.get(`/api/listings/${listingId}`).expect(404);
    await admin.agent.post(`/api/admin/reports/${id}/resolve`).send({}).expect(409);
  });

  it('closes a report without action and keeps the listing', async () => {
    const { admin, student, listingId } = await setup();
    await student.agent.post('/api/reports').send({ listingId, reason: 'Spam' }).expect(201);
    const [{ id }] = (await admin.agent.get('/api/admin/reports').expect(200)).body.reports;
    await admin.agent.post(`/api/admin/reports/${id}/resolve`).send({ removeListing: false }).expect(204);
    const [[listing]] = await pool.query('SELECT status FROM listings WHERE id = ?', [listingId]);
    expect(listing.status).toBe('active');
  });

  it('cannot remove a listing for a report about a student', async () => {
    const { admin, student, seller } = await setup();
    await student.agent.post('/api/reports').send({ reportedUserId: seller.user.id, reason: 'Spam' }).expect(201);
    const [{ id }] = (await admin.agent.get('/api/admin/reports').expect(200)).body.reports;
    await admin.agent.post(`/api/admin/reports/${id}/resolve`).send({ removeListing: true }).expect(400);
  });

  it('does not remove a listing while its auction is active', async () => {
    const { admin, student, listingId } = await setup();
    await pool.query("UPDATE listings SET status = 'in_auction' WHERE id = ?", [listingId]);
    await pool.query(
      `INSERT INTO auctions (listing_id, starting_price, bid_increment, start_time, end_time)
       VALUES (?, 100, 10, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY)`,
      [listingId],
    );
    await student.agent.post('/api/complaints').send({ listingId, reason: 'Other' }).expect(201);
    const [{ id }] = (await admin.agent.get('/api/admin/complaints').expect(200)).body.complaints;
    await admin.agent.post(`/api/admin/complaints/${id}/resolve`).send({ removeListing: true }).expect(409);
    const [[complaint]] = await pool.query('SELECT status FROM complaints WHERE id = ?', [id]);
    expect(complaint.status).toBe('open');
  });

  it('handles a complaint by removing the listing', async () => {
    const { admin, student, listingId } = await setup();
    await student.agent.post('/api/complaints').send({ listingId, reason: 'Item not as described' }).expect(201);
    const list = await admin.agent.get('/api/admin/complaints').expect(200);
    expect(list.body.complaints[0]).toMatchObject({ complainantName: 'Priya Sharma', listing: { id: listingId } });
    await admin.agent.post(`/api/admin/complaints/${list.body.complaints[0].id}/resolve`).send({ removeListing: true }).expect(204);
    const [[listing]] = await pool.query('SELECT status FROM listings WHERE id = ?', [listingId]);
    expect(listing.status).toBe('removed');
  });

  it('returns 404 for a missing report or complaint and validates the note', async () => {
    const { admin } = await setup();
    await admin.agent.post('/api/admin/reports/999999/resolve').send({}).expect(404);
    await admin.agent.post('/api/admin/complaints/999999/resolve').send({}).expect(404);
    await admin.agent.post('/api/admin/reports/1/resolve').send({ note: 'x'.repeat(501) }).expect(400);
  });
});
