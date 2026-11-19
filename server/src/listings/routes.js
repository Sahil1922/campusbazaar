import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { requireAuth, requireRole } from '../auth/session.js';
import { MAX_IMAGES, checkImages, deleteImages, imageUrl, parseListingForm, saveImages } from './images.js';

export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'];
const PAGE_SIZE = 24;
// Approved rule: prices are ₹1 to ₹10,00,000 (docs/business-rules.md).
const MIN_PRICE = 1;
const MAX_PRICE = 1000000;

const blankToUndefined = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);
const money = (message) =>
  z
    .string({ error: message })
    .trim()
    .refine((v) => /^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) >= MIN_PRICE && Number(v) <= MAX_PRICE, message);

const listingFields = z.object({
  title: z
    .string({ error: 'Enter the item name.' })
    .trim()
    .min(3, 'Item name must be 3–120 characters.')
    .max(120, 'Item name must be 3–120 characters.'),
  description: z
    .string({ error: 'Enter a description.' })
    .trim()
    .min(10, 'Description must be 10–2000 characters.')
    .max(2000, 'Description must be 10–2000 characters.'),
  categoryId: z.coerce.number({ error: 'Choose a category.' }).int('Choose a category.').positive('Choose a category.'),
  condition: z.enum(CONDITIONS, { error: 'Choose the condition.' }),
  price: money('Enter a price between ₹1 and ₹10,00,000 (up to 2 decimals).'),
  // Approved Option B: the price is still required; sellers may mark it as negotiable.
  priceNegotiable: z
    .enum(['true', 'false'], { error: 'Choose whether the price is negotiable.' })
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  keepImageIds: z
    .string()
    .max(200)
    .regex(/^(\d+(,\d+)*)?$/, 'Invalid photo list.')
    .optional(),
});

const searchSchema = z.object({
  q: blankToUndefined(z.string().trim().max(100).optional()),
  category: blankToUndefined(z.coerce.number().int().positive().optional()),
  condition: blankToUndefined(
    z
      .string()
      .max(100)
      .transform((v) => [...new Set(v.split(',').filter(Boolean))])
      .refine((list) => list.every((c) => CONDITIONS.includes(c)), 'Choose valid conditions.')
      .optional(),
  ),
  min: blankToUndefined(money('Enter a valid minimum price.').optional()),
  max: blankToUndefined(money('Enter a valid maximum price.').optional()),
  sort: blankToUndefined(z.enum(['newest', 'price_asc', 'price_desc']).optional()),
  page: blankToUndefined(z.coerce.number().int().min(1).max(1000).optional()),
});

const idSchema = z.coerce.number().int().positive();

// The latest auction of each listing, if any.
const FROM = `
  FROM listings l
  JOIN categories c ON c.id = l.category_id
  JOIN users u ON u.id = l.seller_id
  LEFT JOIN auctions a ON a.id = (SELECT MAX(a2.id) FROM auctions a2 WHERE a2.listing_id = l.id)`;

// UC-03 business rule: only active, available listings are shown. An item in an auction is
// available only while the server-side auction is open. Listings of suspended students are hidden
// while they are suspended (approved 16 Nov 2026).
const VISIBLE = `((l.status = 'active' OR (l.status = 'in_auction' AND a.status = 'active' AND a.end_time > UTC_TIMESTAMP()))
  AND u.account_status = 'active')`;

// The price a buyer sees: the current (or starting) bid for an auction, otherwise the listing price.
const SHOWN_PRICE = `(CASE WHEN l.status = 'in_auction' THEN COALESCE(a.current_bid, a.starting_price) ELSE l.price END)`;

const SELECT = `
  SELECT l.id, l.seller_id, l.title, l.description, l.category_id, l.item_condition, l.price, l.price_negotiable,
         l.status, l.created_at,
         c.name AS category_name, u.name AS seller_name,
         a.id AS auction_id, a.status AS auction_status, a.end_time AS auction_end_time,
         a.current_bid AS auction_current_bid, a.starting_price AS auction_starting_price,
         (SELECT li.file_path FROM listing_images li WHERE li.listing_id = l.id
           ORDER BY li.sort_order, li.id LIMIT 1) AS cover_path
  ${FROM}`;

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
const toNumber = (v) => (v === null || v === undefined ? null : Number(v));

function toView(row, { images, seller } = {}) {
  let auction = null;
  if (row.auction_id) {
    const open = row.auction_status === 'active' && new Date(row.auction_end_time).getTime() > Date.now();
    auction = {
      id: Number(row.auction_id),
      status: open ? 'active' : 'ended',
      endTime: row.auction_end_time,
      currentBid: toNumber(row.auction_current_bid),
      startingPrice: toNumber(row.auction_starting_price),
    };
  }
  return {
    id: Number(row.id),
    sellerId: Number(row.seller_id),
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    category: { id: row.category_id, name: row.category_name },
    condition: row.item_condition,
    price: Number(row.price),
    priceNegotiable: Boolean(row.price_negotiable),
    status: row.status,
    createdAt: row.created_at,
    images: images ?? (row.cover_path ? [{ id: null, url: imageUrl(row.cover_path) }] : []),
    seller: seller ?? { id: Number(row.seller_id), name: row.seller_name },
    auction,
  };
}

export async function loadListing(id) {
  const [rows] = await pool.execute(`${SELECT} WHERE l.id = ?`, [id]);
  if (rows.length === 0) return null;
  const row = rows[0];
  const [images] = await pool.execute(
    'SELECT id, file_path FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
    [id],
  );
  const [[rating]] = await pool.execute(
    'SELECT COUNT(*) AS reviewsCount, ROUND(AVG(rating), 1) AS averageRating FROM reviews WHERE reviewee_id = ?',
    [row.seller_id],
  );
  return toView(row, {
    images: images.map((img) => ({ id: Number(img.id), url: imageUrl(img.file_path) })),
    seller: {
      id: Number(row.seller_id),
      name: row.seller_name,
      averageRating: toNumber(rating.averageRating),
      reviewsCount: Number(rating.reviewsCount),
    },
  });
}

async function assertCategoryExists(categoryId) {
  const [rows] = await pool.execute('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (rows.length === 0) {
    throw new HttpError(400, 'Some of the information entered is invalid.', [{ field: 'categoryId', message: 'Choose a category.' }]);
  }
}

/** Throws unless `listing` exists, belongs to `userId`, and is still editable (status active). */
function assertEditable(listing, userId) {
  if (!listing || listing.status === 'deleted' || listing.status === 'removed') {
    throw new HttpError(404, 'This listing has been removed or is no longer available.');
  }
  if (Number(listing.seller_id) !== userId) throw new HttpError(403, 'You can only change your own listings.');
  if (listing.status !== 'active') throw new HttpError(409, 'Listings that are in an auction or sold cannot be changed.');
}

export const categoriesRouter = Router();
categoriesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY id');
    res.json({ categories: rows });
  }),
);

export const listingsRouter = Router();
// The marketplace is for verified students only: every listing route requires sign-in.
listingsRouter.use(requireAuth);

/** UC-03 View Listings + UC-04 Search and Filter Items. */
listingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = parseInput(searchSchema, req.query);
    if (f.min !== undefined && f.max !== undefined && Number(f.min) > Number(f.max)) {
      throw new HttpError(400, 'Minimum price cannot be more than maximum price.');
    }
    const where = [VISIBLE];
    const params = [];
    const words = (f.q ?? '').split(/\s+/).filter(Boolean).slice(0, 10);
    for (const word of words) {
      where.push('(l.title LIKE ? OR l.description LIKE ?)');
      const pattern = `%${escapeLike(word)}%`;
      params.push(pattern, pattern);
    }
    if (f.category) {
      where.push('l.category_id = ?');
      params.push(f.category);
    }
    if (f.condition?.length) {
      where.push(`l.item_condition IN (${f.condition.map(() => '?').join(', ')})`);
      params.push(...f.condition);
    }
    if (f.min !== undefined) {
      where.push(`${SHOWN_PRICE} >= ?`);
      params.push(f.min);
    }
    if (f.max !== undefined) {
      where.push(`${SHOWN_PRICE} <= ?`);
      params.push(f.max);
    }
    const order = {
      newest: 'l.created_at DESC, l.id DESC',
      price_asc: `${SHOWN_PRICE} ASC, l.id DESC`,
      price_desc: `${SHOWN_PRICE} DESC, l.id DESC`,
    }[f.sort ?? 'newest'];
    const page = f.page ?? 1;
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${FROM} ${whereSql}`, params);
    const [rows] = await pool.query(`${SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [
      ...params,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ]);
    res.json({ listings: rows.map((r) => toView(r)), page, pageSize: PAGE_SIZE, total: Number(total) });
  }),
);

/** The signed-in seller's own listings (everything except listings they deleted). */
listingsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `${SELECT} WHERE l.seller_id = ? AND l.status <> 'deleted' ORDER BY l.created_at DESC, l.id DESC LIMIT 500`,
      [req.user.id],
    );
    res.json({ listings: rows.map((r) => toView(r)) });
  }),
);

/** UC-03 listing details. Owners can also see their own listings that are not currently available. */
listingsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const listing = await loadListing(id);
    const isOwner = listing?.sellerId === req.user.id;
    const [[seller]] = listing ? await pool.execute('SELECT account_status FROM users WHERE id = ?', [listing.sellerId]) : [[null]];
    const available = listing && ['active', 'in_auction'].includes(listing.status) && seller?.account_status === 'active';
    if (!listing || listing.status === 'deleted' || (!available && !isOwner)) {
      throw new HttpError(404, 'This listing has been removed or is no longer available.');
    }
    res.json({ listing });
  }),
);

/** UC-02 Create Listing (multipart form with optional `images`). */
listingsRouter.post(
  '/',
  requireRole('seller'),
  parseListingForm,
  asyncHandler(async (req, res) => {
    const input = parseInput(listingFields, req.body);
    const files = req.files ?? [];
    const types = checkImages(files);
    await assertCategoryExists(input.categoryId);

    const paths = await saveImages(files, types);
    let id;
    try {
      id = await withTransaction(async (conn) => {
        const [result] = await conn.execute(
          `INSERT INTO listings (seller_id, title, description, category_id, item_condition, price, price_negotiable)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.user.id, input.title, input.description, input.categoryId, input.condition, input.price, input.priceNegotiable],
        );
        if (paths.length) {
          await conn.query('INSERT INTO listing_images (listing_id, file_path, sort_order) VALUES ?', [
            paths.map((p, i) => [result.insertId, p, i]),
          ]);
        }
        return result.insertId;
      });
    } catch (error) {
      await deleteImages(paths);
      throw error;
    }
    res.status(201).json({ listing: await loadListing(id) });
  }),
);

/**
 * Edit Listing. `keepImageIds` lists existing photos to keep (comma-separated); new photos come in `images`.
 * Without `keepImageIds`, all existing photos are kept.
 */
listingsRouter.put(
  '/:id',
  requireRole('seller'),
  parseListingForm,
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const input = parseInput(listingFields, req.body);
    const [[current]] = await pool.execute('SELECT seller_id, status FROM listings WHERE id = ?', [id]);
    assertEditable(current, req.user.id); // Checked before saving files; re-checked under lock below.
    const files = req.files ?? [];
    const types = checkImages(files);
    await assertCategoryExists(input.categoryId);
    const keepIds = input.keepImageIds === undefined ? null : input.keepImageIds.split(',').filter(Boolean).map(Number);

    const newPaths = await saveImages(files, types);
    let removedPaths = [];
    try {
      await withTransaction(async (conn) => {
        const [[locked]] = await conn.execute('SELECT seller_id, status FROM listings WHERE id = ? FOR UPDATE', [id]);
        assertEditable(locked, req.user.id);
        const [existing] = await conn.execute(
          'SELECT id, file_path FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
          [id],
        );
        const existingIds = existing.map((img) => Number(img.id));
        if (keepIds && keepIds.some((k) => !existingIds.includes(k))) {
          throw new HttpError(400, 'Some of the information entered is invalid.', [{ field: 'images', message: 'A photo to keep was not found. Reload and try again.' }]);
        }
        const kept = keepIds ? existing.filter((img) => keepIds.includes(Number(img.id))) : existing;
        if (kept.length + newPaths.length > MAX_IMAGES) {
          throw new HttpError(400, 'Some of the information entered is invalid.', [{ field: 'images', message: `Add at most ${MAX_IMAGES} photos.` }]);
        }
        const removed = existing.filter((img) => !kept.includes(img));

        await conn.execute(
          `UPDATE listings SET title = ?, description = ?, category_id = ?, item_condition = ?, price = ?, price_negotiable = ?
            WHERE id = ?`,
          [input.title, input.description, input.categoryId, input.condition, input.price, input.priceNegotiable, id],
        );
        if (removed.length) {
          await conn.query('DELETE FROM listing_images WHERE id IN (?)', [removed.map((img) => img.id)]);
        }
        for (let i = 0; i < kept.length; i += 1) {
          await conn.execute('UPDATE listing_images SET sort_order = ? WHERE id = ?', [i, kept[i].id]);
        }
        if (newPaths.length) {
          await conn.query('INSERT INTO listing_images (listing_id, file_path, sort_order) VALUES ?', [
            newPaths.map((p, i) => [id, p, kept.length + i]),
          ]);
        }
        removedPaths = removed.map((img) => img.file_path);
      });
    } catch (error) {
      await deleteImages(newPaths);
      throw error;
    }
    await deleteImages(removedPaths); // Only after the database change is committed.
    res.json({ listing: await loadListing(id) });
  }),
);

/** Delete Listing: the seller's own active listing is marked deleted (history for messages and reports is kept). */
listingsRouter.delete(
  '/:id',
  requireRole('seller'),
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    await withTransaction(async (conn) => {
      const [[locked]] = await conn.execute('SELECT seller_id, status FROM listings WHERE id = ? FOR UPDATE', [id]);
      assertEditable(locked, req.user.id);
      await conn.execute("UPDATE listings SET status = 'deleted' WHERE id = ?", [id]);
    });
    res.status(204).end();
  }),
);

/**
 * Public, read-only home page data for signed-out visitors (approved 16 Nov 2026):
 * card details only — photo, title, price, condition, category and auction price/time.
 * No seller information, descriptions or listing pages; everything else needs sign-in.
 */
function publicCard(row) {
  const card = toView(row);
  return {
    id: card.id,
    title: card.title,
    price: card.price,
    priceNegotiable: card.priceNegotiable,
    condition: card.condition,
    status: card.status,
    category: card.category,
    images: card.images,
    auction: card.auction && card.auction.status === 'active' ? card.auction : null,
  };
}

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.nodeEnv === 'test',
  handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please wait a moment.' }),
});

export const publicRouter = Router();

publicRouter.get(
  '/home',
  publicLimiter,
  asyncHandler(async (req, res) => {
    const [categories] = await pool.query('SELECT id, name FROM categories ORDER BY id');
    const [fresh] = await pool.query(
      `${SELECT} WHERE l.status = 'active' AND u.account_status = 'active' ORDER BY l.created_at DESC, l.id DESC LIMIT 12`,
    );
    const [live] = await pool.query(
      `${SELECT} WHERE l.status = 'in_auction' AND a.status = 'active' AND a.end_time > UTC_TIMESTAMP()
          AND u.account_status = 'active'
        ORDER BY a.end_time ASC LIMIT 6`,
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${FROM} WHERE ${VISIBLE}`);
    res.json({
      categories,
      listings: fresh.map(publicCard),
      liveAuctions: live.map(publicCard),
      totalListings: Number(total),
    });
  }),
);
