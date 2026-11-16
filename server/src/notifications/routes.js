import { Router } from 'express';
import { pool } from '../db.js';
import { asyncHandler } from '../http.js';
import { requireAuth } from '../auth/session.js';

// Receive Winner Notification: notifications are created when the server settles an auction.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, auction_id, type, message, created_at, read_at
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
      [req.user.id],
    );
    res.json({
      notifications: rows.map((n) => ({
        id: Number(n.id),
        auctionId: n.auction_id === null ? null : Number(n.auction_id),
        type: n.type,
        message: n.message,
        createdAt: n.created_at,
        readAt: n.read_at,
      })),
    });
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const [[row]] = await pool.execute('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ count: Number(row.count) });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await pool.execute('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.status(204).end();
  }),
);
