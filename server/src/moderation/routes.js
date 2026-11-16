import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { requireAuth } from '../auth/session.js';
import { perUserLimit } from '../limits.js';

// Reports (UC-10) and complaints (UC-11). Reasons and rules: docs/business-rules.md.
export const REPORT_REASONS = ['Prohibited item', 'Fake or misleading', 'Spam', 'Offensive content', 'Other'];
export const COMPLAINT_REASONS = ['Item not as described', 'Seller did not show up', 'Rude or unsafe behaviour', 'Other'];

const idSchema = z.coerce.number().int().positive();
const optionalId = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().positive().optional());

const reportSchema = z
  .object({
    listingId: optionalId,
    reportedUserId: optionalId,
    reason: z.enum(REPORT_REASONS, { error: 'Choose a reason.' }),
    description: z
      .string()
      .trim()
      .max(2000, 'Details can be at most 2000 characters.')
      .optional()
      .transform((v) => v || null),
  })
  .refine((r) => r.listingId || r.reportedUserId, { message: 'Choose what you are reporting.', path: ['listingId'] });

const complaintSchema = z.object({
  listingId: z.coerce.number({ error: 'Choose the listing.' }).int().positive(),
  reason: z.enum(COMPLAINT_REASONS, { error: 'Choose a reason.' }),
});

const resolveSchema = z.object({
  removeListing: z.boolean().optional().default(false),
  note: z
    .string()
    .trim()
    .max(500, 'Note can be at most 500 characters.')
    .optional()
    .transform((v) => v || null),
});

const statusQuery = z.object({ status: z.enum(['open', 'closed']).optional().default('open') });

async function findListing(listingId, me) {
  const [[listing]] = await pool.execute('SELECT id, seller_id, status FROM listings WHERE id = ?', [listingId]);
  if (!listing || listing.status === 'deleted') throw new HttpError(404, 'This listing is no longer available.');
  if (Number(listing.seller_id) === me) throw new HttpError(400, 'You cannot report or complain about your own listing.');
  return listing;
}

/** Student-facing: submit a report about a listing or a student. */
export const reportsRouter = Router();
reportsRouter.post(
  '/',
  requireAuth,
  perUserLimit({ windowMinutes: 60, limit: 20, message: 'You have sent many reports recently. Please try again later.' }),
  asyncHandler(async (req, res) => {
    const input = parseInput(reportSchema, req.body);
    const me = req.user.id;
    if (input.listingId) await findListing(input.listingId, me);
    if (input.reportedUserId) {
      if (input.reportedUserId === me) throw new HttpError(400, 'You cannot report yourself.');
      const [[user]] = await pool.execute('SELECT id FROM users WHERE id = ?', [input.reportedUserId]);
      if (!user) throw new HttpError(404, 'This student does not exist.');
    }
    await pool.execute(
      'INSERT INTO reports (reporter_id, listing_id, reported_user_id, reason, description) VALUES (?, ?, ?, ?, ?)',
      [me, input.listingId ?? null, input.reportedUserId ?? null, input.reason, input.description],
    );
    res.status(201).json({ message: 'Thank you. An administrator will review your report.' });
  }),
);

/** Student-facing: file a complaint about a deal for a listing. */
export const complaintsRouter = Router();
complaintsRouter.post(
  '/',
  requireAuth,
  perUserLimit({ windowMinutes: 60, limit: 20, message: 'You have sent many complaints recently. Please try again later.' }),
  asyncHandler(async (req, res) => {
    const input = parseInput(complaintSchema, req.body);
    await findListing(input.listingId, req.user.id);
    await pool.execute('INSERT INTO complaints (user_id, listing_id, reason) VALUES (?, ?, ?)', [
      req.user.id,
      input.listingId,
      input.reason,
    ]);
    res.status(201).json({ message: 'Thank you. An administrator will review your complaint.' });
  }),
);

const listingSummary = (row) =>
  row.listing_id === null
    ? null
    : {
        id: Number(row.listing_id),
        title: row.listing_title,
        status: row.listing_status,
        sellerId: Number(row.seller_id),
        sellerName: row.seller_name,
      };

/** Marks a listing removed by an admin, unless it is already gone. Returns whether it changed. */
async function removeListing(conn, adminId, listingId, note) {
  const [[listing]] = await conn.execute('SELECT id, status FROM listings WHERE id = ? FOR UPDATE', [listingId]);
  if (!listing || ['removed', 'deleted'].includes(listing.status)) return false;
  const [[openAuction]] = await conn.execute(
    "SELECT id FROM auctions WHERE listing_id = ? AND status = 'active' AND end_time > UTC_TIMESTAMP() LIMIT 1",
    [listingId],
  );
  if (openAuction) throw new HttpError(409, 'This listing has an active auction and cannot be removed until the auction ends.');
  await conn.execute("UPDATE listings SET status = 'removed' WHERE id = ?", [listingId]);
  await conn.execute(
    "INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, note) VALUES (?, 'remove_listing', 'listing', ?, ?)",
    [adminId, listingId, note],
  );
  return true;
}

/** Admin-only routes; mounted inside the admin router, which already requires the admin role. */
export const moderationAdminRouter = Router();

moderationAdminRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { status } = parseInput(statusQuery, req.query);
    const [rows] = await pool.execute(
      `SELECT r.id, r.reason, r.description, r.status, r.created_at, r.listing_id, r.reported_user_id,
              reporter.name AS reporter_name, l.title AS listing_title, l.status AS listing_status,
              l.seller_id, seller.name AS seller_name, reported.name AS reported_user_name
         FROM reports r
         JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN listings l ON l.id = r.listing_id
         LEFT JOIN users seller ON seller.id = l.seller_id
         LEFT JOIN users reported ON reported.id = r.reported_user_id
        WHERE r.status = ?
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 200`,
      [status],
    );
    res.json({
      reports: rows.map((r) => ({
        id: Number(r.id),
        reason: r.reason,
        description: r.description,
        status: r.status,
        createdAt: r.created_at,
        reporterName: r.reporter_name,
        listing: listingSummary(r),
        reportedUserId: r.reported_user_id === null ? null : Number(r.reported_user_id),
        reportedUserName: r.reported_user_name,
      })),
    });
  }),
);

moderationAdminRouter.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const { status } = parseInput(statusQuery, req.query);
    const [rows] = await pool.execute(
      `SELECT c.id, c.reason, c.status, c.created_at, c.listing_id, u.name AS complainant_name,
              l.title AS listing_title, l.status AS listing_status, l.seller_id, seller.name AS seller_name
         FROM complaints c
         JOIN users u ON u.id = c.user_id
         JOIN listings l ON l.id = c.listing_id
         JOIN users seller ON seller.id = l.seller_id
        WHERE c.status = ?
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 200`,
      [status],
    );
    res.json({
      complaints: rows.map((c) => ({
        id: Number(c.id),
        reason: c.reason,
        status: c.status,
        createdAt: c.created_at,
        complainantName: c.complainant_name,
        listing: listingSummary(c),
      })),
    });
  }),
);

/** UC-10/UC-11: close a report, optionally removing the reported listing. Everything is recorded. */
moderationAdminRouter.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { removeListing: remove, note } = parseInput(resolveSchema, req.body);
    const adminId = req.user.id;
    await withTransaction(async (conn) => {
      const [[report]] = await conn.execute('SELECT id, status, listing_id FROM reports WHERE id = ? FOR UPDATE', [id]);
      if (!report) throw new HttpError(404, 'This report is no longer available.');
      if (report.status !== 'open') throw new HttpError(409, 'This report has already been closed.');
      if (remove) {
        if (report.listing_id === null) throw new HttpError(400, 'This report is about a student, not a listing.');
        await removeListing(conn, adminId, report.listing_id, note);
      }
      await conn.execute("UPDATE reports SET status = 'closed', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?", [adminId, id]);
      await conn.execute(
        "INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, note) VALUES (?, ?, 'report', ?, ?)",
        [adminId, remove ? 'close_report_removed_listing' : 'close_report', id, note],
      );
    });
    res.status(204).end();
  }),
);

/** UC-11: handle a complaint — remove the listing if it is valid, or close it with no action. */
moderationAdminRouter.post(
  '/complaints/:id/resolve',
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { removeListing: remove, note } = parseInput(resolveSchema, req.body);
    const adminId = req.user.id;
    await withTransaction(async (conn) => {
      const [[complaint]] = await conn.execute('SELECT id, status, listing_id FROM complaints WHERE id = ? FOR UPDATE', [id]);
      if (!complaint) throw new HttpError(404, 'This complaint is no longer available.');
      if (complaint.status !== 'open') throw new HttpError(409, 'This complaint has already been closed.');
      if (remove) await removeListing(conn, adminId, complaint.listing_id, note);
      await conn.execute("UPDATE complaints SET status = 'closed', resolved_by = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?", [adminId, id]);
      await conn.execute(
        "INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, note) VALUES (?, ?, 'complaint', ?, ?)",
        [adminId, remove ? 'close_complaint_removed_listing' : 'close_complaint', id, note],
      );
    });
    res.status(204).end();
  }),
);
