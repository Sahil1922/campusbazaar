import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { requireAuth } from '../auth/session.js';
import { perUserLimit } from '../limits.js';

// UC-06 Rate and Review. Approved rule (docs/business-rules.md): any student may review another
// student — never themselves — once per seller per listing. The listing must belong to the reviewee.

const idSchema = z.coerce.number().int().positive();
const reviewSchema = z.object({
  revieweeId: z.coerce.number({ error: 'Choose who to review.' }).int().positive(),
  listingId: z.coerce.number({ error: 'Choose the listing you are reviewing.' }).int().positive(),
  rating: z.coerce
    .number({ error: 'Select a rating from 1 to 5 stars.' })
    .int('Select a rating from 1 to 5 stars.')
    .min(1, 'Select a rating from 1 to 5 stars.')
    .max(5, 'Select a rating from 1 to 5 stars.'),
  comment: z
    .string()
    .trim()
    .max(1000, 'Review must be at most 1000 characters.')
    .optional()
    .transform((v) => v || null),
});

const toReview = (row, me) => ({
  id: Number(row.id),
  reviewerId: Number(row.reviewer_id),
  reviewerName: row.reviewer_name,
  revieweeId: Number(row.reviewee_id),
  listingId: row.listing_id === null ? null : Number(row.listing_id),
  rating: Number(row.rating),
  comment: row.comment,
  createdAt: row.created_at,
  isMine: Number(row.reviewer_id) === me,
});

const SELECT = `SELECT r.id, r.reviewer_id, r.reviewee_id, r.listing_id, r.rating, r.comment, r.created_at,
                       u.name AS reviewer_name
                  FROM reviews r JOIN users u ON u.id = r.reviewer_id`;

export const userReviewsRouter = Router();
userReviewsRouter.use(requireAuth);

/** Reviews a student has received, newest first. */
userReviewsRouter.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const userId = parseInput(idSchema, req.params.id);
    const [[user]] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) throw new HttpError(404, 'This student does not exist.');
    const [rows] = await pool.execute(`${SELECT} WHERE r.reviewee_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 200`, [userId]);
    res.json({ reviews: rows.map((r) => toReview(r, req.user.id)) });
  }),
);

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

reviewsRouter.post(
  '/',
  perUserLimit({ windowMinutes: 60, limit: 20, message: 'You have written many reviews recently. Please try again later.' }),
  asyncHandler(async (req, res) => {
    const input = parseInput(reviewSchema, req.body);
    const me = req.user.id;
    if (input.revieweeId === me) throw new HttpError(403, 'You cannot review yourself.');

    const [[listing]] = await pool.execute('SELECT seller_id FROM listings WHERE id = ?', [input.listingId]);
    if (!listing) throw new HttpError(404, 'This listing does not exist.');
    if (Number(listing.seller_id) !== input.revieweeId) {
      throw new HttpError(400, 'You can only review the seller of this listing.');
    }

    let result;
    try {
      [result] = await pool.execute(
        'INSERT INTO reviews (reviewer_id, reviewee_id, listing_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [me, input.revieweeId, input.listingId, input.rating, input.comment],
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'You have already reviewed this seller for this listing.');
      throw error;
    }
    const [[row]] = await pool.execute(`${SELECT} WHERE r.id = ?`, [result.insertId]);
    res.status(201).json({ review: toReview(row, me) });
  }),
);
