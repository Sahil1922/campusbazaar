import { Router } from 'express';
import { pool } from '../db.js';
import { asyncHandler } from '../http.js';
import { publicUser, requireAuth } from '../auth/session.js';

export const profileRouter = Router();

/**
 * UC-01 View Profile: the signed-in user's own basic information and marketplace activity.
 * Activity is calculated from the marketplace tables rather than stored, so it cannot drift.
 */
profileRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [[listingStats]] = await pool.execute(
      `SELECT COUNT(*) AS listingsPosted,
              COALESCE(SUM(status IN ('active', 'in_auction')), 0) AS activeListings
         FROM listings WHERE seller_id = ? AND status <> 'removed'`,
      [userId],
    );
    const [[bidStats]] = await pool.execute('SELECT COUNT(*) AS bidsPlaced FROM bids WHERE bidder_id = ?', [userId]);
    const [[reviewStats]] = await pool.execute(
      `SELECT COUNT(*) AS reviewsReceived, ROUND(AVG(rating), 1) AS averageRating
         FROM reviews WHERE reviewee_id = ?`,
      [userId],
    );

    res.json({
      profile: publicUser(req.user),
      activity: {
        listingsPosted: Number(listingStats.listingsPosted),
        activeListings: Number(listingStats.activeListings),
        bidsPlaced: Number(bidStats.bidsPlaced),
        reviewsReceived: Number(reviewStats.reviewsReceived),
        averageRating: reviewStats.averageRating === null ? null : Number(reviewStats.averageRating),
      },
    });
  }),
);
