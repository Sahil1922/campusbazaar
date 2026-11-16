import { pool, withTransaction } from '../db.js';
import { emitAuctionChanged, emitNotificationsChanged } from '../realtime.js';

const rupees = (amount) => `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Ends one auction if its server-side end time has passed: records the highest bidder as the
 * winner, marks the listing sold and notifies the winner. Safe to call concurrently — the auction row is locked and re-checked.
 */
async function settleAuction(auctionId) {
  const settled = await withTransaction(async (conn) => {
    const [[auction]] = await conn.execute(
      `SELECT a.id, a.listing_id, a.current_bid, a.current_bidder_id, l.title
         FROM auctions a JOIN listings l ON l.id = a.listing_id
        WHERE a.id = ? AND a.status = 'active' AND a.end_time <= UTC_TIMESTAMP()
        FOR UPDATE OF a`,
      [auctionId],
    );
    if (!auction) return null; // Already settled, or not due yet.
    await conn.execute("UPDATE auctions SET status = 'ended', winner_id = ? WHERE id = ?", [auction.current_bidder_id, auctionId]);
    if (!auction.current_bidder_id) {
      // Approved rule: an auction that ends with no bids puts the listing back on sale at its listed price.
      await conn.execute("UPDATE listings SET status = 'active' WHERE id = ? AND status = 'in_auction'", [auction.listing_id]);
    }
    if (auction.current_bidder_id) {
      // Approved rule: an auction that ends with a winner marks its listing as sold.
      await conn.execute("UPDATE listings SET status = 'sold' WHERE id = ? AND status = 'in_auction'", [auction.listing_id]);
      await conn.execute(
        "INSERT INTO notifications (user_id, auction_id, type, message) VALUES (?, ?, 'auction_won', ?)",
        [
          auction.current_bidder_id,
          auctionId,
          `You won the auction for "${auction.title}" with a bid of ${rupees(auction.current_bid)}.`.slice(0, 500),
        ],
      );
    }
    return auction;
  });
  // Broadcast only after the result is committed.
  if (settled) {
    emitAuctionChanged(auctionId);
    if (settled.current_bidder_id) emitNotificationsChanged(Number(settled.current_bidder_id));
  }
  return Boolean(settled);
}

/** Settles every auction that is due (or just `auctionId`). Called by a timer and before auction reads. */
export async function settleDueAuctions({ auctionId } = {}) {
  const [due] = auctionId
    ? await pool.execute("SELECT id FROM auctions WHERE id = ? AND status = 'active' AND end_time <= UTC_TIMESTAMP()", [auctionId])
    : await pool.query("SELECT id FROM auctions WHERE status = 'active' AND end_time <= UTC_TIMESTAMP() ORDER BY end_time LIMIT 100");
  let count = 0;
  for (const { id } of due) if (await settleAuction(Number(id))) count += 1;
  return count;
}
