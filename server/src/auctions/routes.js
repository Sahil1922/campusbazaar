import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { requireAuth, requireRole } from '../auth/session.js';
import { perUserLimit } from '../limits.js';
import { emitAuctionChanged } from '../realtime.js';
import { imageUrl } from '../listings/images.js';
import { loadListing } from '../listings/routes.js';
import { settleDueAuctions } from './settle.js';

// UC-07 Start Auction, UC-08 Set Auction Details, UC-09 Place Bid / Participate in Auction.
// The server and database are authoritative for status, current bid, end time and winner.
// Approved rules (docs/business-rules.md): first bid >= starting price; later bids >= current bid +
// increment; bids only before the server-side end time; sellers cannot bid on their own auctions.

export const DURATION_HOURS = [1, 6, 12, 24, 72, 168];
// Approved rule: every amount is ₹1 to ₹10,00,000 (docs/business-rules.md).
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1000000;

const money = (message) =>
  z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : v),
    z
      .string({ error: message })
      .trim()
      .refine((v) => /^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) >= MIN_AMOUNT && Number(v) <= MAX_AMOUNT, message),
  );

const startSchema = z.object({
  listingId: z.coerce.number({ error: 'Choose a listing.' }).int().positive(),
  startingPrice: money('Enter a valid starting price (₹1 to ₹10,00,000).'),
  bidIncrement: money('Enter a valid bid increment (₹1 to ₹10,00,000).'),
  durationHours: z.coerce
    .number({ error: 'Choose a valid duration.' })
    .refine((h) => DURATION_HOURS.includes(h), 'Choose a valid duration.'),
});

const bidSchema = z.object({ amount: money('Enter a valid amount in rupees (up to 2 decimals).') });
const idSchema = z.coerce.number().int().positive();
const listQuery = z.object({ status: z.enum(['active', 'ended']).optional().default('active') });

// Money is compared in whole paise to avoid floating-point errors.
const paise = (v) => Math.round(Number(v) * 100);
const fromPaise = (p) => p / 100;
const toNumber = (v) => (v === null || v === undefined ? null : Number(v));
const maskName = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]}${'•'.repeat(Math.max(2, part.length - 1))}`)
    .join(' ');

function minimumBidPaise(auction) {
  return auction.current_bid === null ? paise(auction.starting_price) : paise(auction.current_bid) + paise(auction.bid_increment);
}

/** Full auction view for one viewer. Bidder names are shown to the seller (View Bids) and to the bidder themselves. */
async function loadAuction(auctionId, me) {
  const [[a]] = await pool.execute(
    `SELECT a.*, l.seller_id, (a.status = 'active' AND a.end_time > UTC_TIMESTAMP()) AS open
       FROM auctions a JOIN listings l ON l.id = a.listing_id WHERE a.id = ?`,
    [auctionId],
  );
  if (!a) return null;
  const isSeller = Number(a.seller_id) === me;
  const [bidRows] = await pool.execute(
    `SELECT b.id, b.bidder_id, b.amount, b.placed_at, u.name
       FROM bids b JOIN users u ON u.id = b.bidder_id
      WHERE b.auction_id = ? ORDER BY b.amount DESC, b.id ASC LIMIT 200`,
    [auctionId],
  );
  const [[{ bidCount }]] = await pool.execute('SELECT COUNT(*) AS bidCount FROM bids WHERE auction_id = ?', [auctionId]);
  const showName = (userId, name) => (isSeller || Number(userId) === me ? name : maskName(name));
  const winner = a.winner_id ? bidRows.find((b) => Number(b.bidder_id) === Number(a.winner_id)) : null;

  return {
    id: Number(a.id),
    listingId: Number(a.listing_id),
    startingPrice: Number(a.starting_price),
    bidIncrement: Number(a.bid_increment),
    startTime: a.start_time,
    endTime: a.end_time,
    // An unsettled auction past its end time is already closed for bidding.
    status: a.open ? 'active' : 'ended',
    currentBid: toNumber(a.current_bid),
    winnerId: toNumber(a.winner_id),
    winnerName: winner ? showName(winner.bidder_id, winner.name) : null,
    minimumBid: fromPaise(minimumBidPaise(a)),
    bidCount: Number(bidCount),
    isSeller,
    isWinner: a.winner_id !== null && Number(a.winner_id) === me,
    iAmHighest: a.current_bidder_id !== null && Number(a.current_bidder_id) === me,
    listing: await loadListing(Number(a.listing_id)),
    bids: bidRows.map((b) => ({
      id: Number(b.id),
      amount: Number(b.amount),
      placedAt: b.placed_at,
      isMine: Number(b.bidder_id) === me,
      bidderName: showName(b.bidder_id, b.name),
    })),
  };
}

export const auctionsRouter = Router();
auctionsRouter.use(requireAuth);

/** Live auctions (ending soonest first) or ended auctions (most recent first). */
auctionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = parseInput(listQuery, req.query);
    await settleDueAuctions();
    const where =
      status === 'active'
        ? "a.status = 'active' AND a.end_time > UTC_TIMESTAMP()"
        : "(a.status = 'ended' OR a.end_time <= UTC_TIMESTAMP())";
    const order = status === 'active' ? 'a.end_time ASC' : 'a.end_time DESC';
    const [rows] = await pool.query(
      `SELECT a.id, a.listing_id, a.starting_price, a.bid_increment, a.end_time, a.current_bid, a.winner_id,
              l.title, l.item_condition, l.category_id, c.name AS category_name, l.seller_id,
              (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bid_count,
              (SELECT li.file_path FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.sort_order, li.id LIMIT 1) AS cover_path
         FROM auctions a
         JOIN listings l ON l.id = a.listing_id
         JOIN categories c ON c.id = l.category_id
        WHERE ${where} AND l.status NOT IN ('removed', 'deleted')
        ORDER BY ${order}
        LIMIT 60`,
    );
    res.json({
      auctions: rows.map((r) => ({
        id: Number(r.id),
        status,
        startingPrice: Number(r.starting_price),
        bidIncrement: Number(r.bid_increment),
        endTime: r.end_time,
        currentBid: toNumber(r.current_bid),
        bidCount: Number(r.bid_count),
        isSeller: Number(r.seller_id) === req.user.id,
        listing: {
          id: Number(r.listing_id),
          title: r.title,
          condition: r.item_condition,
          categoryId: r.category_id,
          category: { id: r.category_id, name: r.category_name },
          images: r.cover_path ? [{ id: null, url: imageUrl(r.cover_path) }] : [],
        },
      })),
    });
  }),
);

auctionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    await settleDueAuctions({ auctionId: id });
    const auction = await loadAuction(id, req.user.id);
    if (!auction) throw new HttpError(404, 'This auction does not exist.');
    res.json({ auction });
  }),
);

/** UC-07 + UC-08: start an auction on the seller's own active listing. The server sets the times. */
auctionsRouter.post(
  '/',
  requireRole('seller'),
  asyncHandler(async (req, res) => {
    const input = parseInput(startSchema, req.body);
    const auctionId = await withTransaction(async (conn) => {
      const [[listing]] = await conn.execute('SELECT id, seller_id, status, price FROM listings WHERE id = ? FOR UPDATE', [input.listingId]);
      if (!listing || ['removed', 'deleted'].includes(listing.status)) throw new HttpError(404, 'This listing is no longer available.');
      if (Number(listing.seller_id) !== req.user.id) throw new HttpError(403, 'You can only auction your own listings.');
      if (listing.status !== 'active') {
        throw new HttpError(409, 'Only active listings that are not already in an auction can be auctioned.');
      }
      // Approved rule (16 Nov 2026): the starting price may not exceed the listing's own price.
      if (paise(input.startingPrice) > paise(listing.price)) {
        const text = `Starting price can't be more than your listed price (₹${Number(listing.price).toLocaleString('en-IN')}). Edit the listing price first if you want to start higher.`;
        throw new HttpError(400, 'Some of the auction details are invalid.', [{ field: 'startingPrice', message: text }]);
      }
      const [result] = await conn.execute(
        `INSERT INTO auctions (listing_id, starting_price, bid_increment, start_time, end_time)
         VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ? HOUR)`,
        [listing.id, input.startingPrice, input.bidIncrement, input.durationHours],
      );
      await conn.execute("UPDATE listings SET status = 'in_auction' WHERE id = ?", [listing.id]);
      return result.insertId;
    });
    res.status(201).json({ auction: await loadAuction(auctionId, req.user.id) });
  }),
);

/**
 * UC-09 Place Bid. The auction row is locked, so concurrent bids are checked one at a time
 * against the latest saved state. The bid is committed before it is broadcast.
 */
auctionsRouter.post(
  '/:id/bids',
  perUserLimit({ windowMinutes: 1, limit: 30, message: 'You are bidding too quickly. Please wait a moment.' }),
  asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { amount } = parseInput(bidSchema, req.body);
    const me = req.user.id;

    await withTransaction(async (conn) => {
      const [[a]] = await conn.execute(
        `SELECT a.id, a.status, a.starting_price, a.bid_increment, a.current_bid, l.seller_id,
                (a.end_time > UTC_TIMESTAMP()) AS before_end
           FROM auctions a JOIN listings l ON l.id = a.listing_id
          WHERE a.id = ?
          FOR UPDATE OF a`,
        [id],
      );
      if (!a) throw new HttpError(404, 'This auction does not exist.');
      if (a.status !== 'active' || !a.before_end) throw new HttpError(409, 'This auction has already ended.');
      if (Number(a.seller_id) === me) throw new HttpError(403, 'You cannot bid on your own auction.');
      const min = minimumBidPaise(a);
      if (paise(amount) < min) {
        const text = `Your bid must be at least ₹${fromPaise(min).toLocaleString('en-IN')}.`;
        throw new HttpError(409, text, [{ field: 'amount', message: text }]);
      }
      await conn.execute('INSERT INTO bids (auction_id, bidder_id, amount) VALUES (?, ?, ?)', [id, me, amount]);
      await conn.execute('UPDATE auctions SET current_bid = ?, current_bidder_id = ? WHERE id = ?', [amount, me, id]);
    });

    emitAuctionChanged(id); // Only after the commit above succeeded.
    res.status(201).json({ auction: await loadAuction(id, me) });
  }),
);
