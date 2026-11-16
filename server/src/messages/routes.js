import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { requireAuth } from '../auth/session.js';
import { perUserLimit } from '../limits.js';
import { emitMessagesChanged } from '../realtime.js';

// UC-05 Contact Seller / Send Message.
// A conversation is identified by a listing and its buyer; the other participant is the listing's seller.

const idSchema = z.coerce.number().int().positive();
const contentSchema = z.object({
  content: z
    .string({ error: 'Enter a message before sending.' })
    .trim()
    .min(1, 'Enter a message before sending.')
    .max(2000, 'Messages can be at most 2000 characters.'),
});

const AVAILABLE = ['active', 'in_auction'];

// Messages between a listing's seller and one buyer.
const IN_CONVERSATION = `m.listing_id = ?
  AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))`;
const conversationParams = (listingId, buyerId, sellerId) => [listingId, buyerId, sellerId, sellerId, buyerId];

/** Loads the listing and checks that the signed-in user is the buyer or the seller of this conversation. */
async function resolveConversation(conn, me, listingId, buyerId) {
  const [[listing]] = await conn.execute(
    `SELECT l.id, l.title, l.price, l.status, l.seller_id, s.name AS seller_name, s.account_status AS seller_status
       FROM listings l JOIN users s ON s.id = l.seller_id WHERE l.id = ?`,
    [listingId],
  );
  // Participants keep their history even if the listing was later deleted or removed;
  // sending and starting conversations are limited to available listings by the callers.
  if (!listing) throw new HttpError(404, 'This listing is no longer available.');
  const sellerId = Number(listing.seller_id);
  if (buyerId === sellerId) throw new HttpError(400, 'You cannot message yourself about your own listing.');
  if (me !== buyerId && me !== sellerId) throw new HttpError(403, 'You are not part of this conversation.');
  const [[buyer]] = await conn.execute('SELECT id, name, account_status FROM users WHERE id = ?', [buyerId]);
  if (!buyer) throw new HttpError(404, 'This conversation does not exist.');
  return { listing, sellerId, buyer };
}

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

/** Conversations of the signed-in user, newest first, with the last message and unread state. */
messagesRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const me = req.user.id;
    const [groups] = await pool.query(
      `SELECT t.listing_id, t.buyer_id, MAX(t.id) AS last_id,
              SUM(t.recipient_id = ? AND t.read_at IS NULL) AS unread
         FROM (SELECT m.id, m.listing_id, m.recipient_id, m.read_at,
                      CASE WHEN m.sender_id = l.seller_id THEN m.recipient_id ELSE m.sender_id END AS buyer_id
                 FROM messages m JOIN listings l ON l.id = m.listing_id
                WHERE m.sender_id = ? OR m.recipient_id = ?) t
        GROUP BY t.listing_id, t.buyer_id
        ORDER BY last_id DESC
        LIMIT 200`,
      [me, me, me],
    );
    if (groups.length === 0) return res.json({ conversations: [] });

    const [lasts] = await pool.query(
      `SELECT m.id, m.content, m.sender_id, m.sent_at, l.title, l.status,
              seller.name AS seller_name, buyer.name AS buyer_name
         FROM messages m
         JOIN listings l ON l.id = m.listing_id
         JOIN users seller ON seller.id = l.seller_id
         JOIN users buyer ON buyer.id = CASE WHEN m.sender_id = l.seller_id THEN m.recipient_id ELSE m.sender_id END
        WHERE m.id IN (?)`,
      [groups.map((g) => g.last_id)],
    );
    const byId = new Map(lasts.map((m) => [Number(m.id), m]));
    const conversations = groups.map((g) => {
      const last = byId.get(Number(g.last_id));
      const buyerId = Number(g.buyer_id);
      const buying = buyerId === me;
      return {
        listingId: Number(g.listing_id),
        buyerId,
        listingTitle: last.title,
        listingStatus: last.status,
        otherName: buying ? last.seller_name : last.buyer_name,
        role: buying ? 'buying' : 'selling',
        unread: Number(g.unread) > 0,
        lastMessage: { content: last.content, senderId: Number(last.sender_id), sentAt: last.sent_at },
      };
    });
    res.json({ conversations });
  }),
);

/** Number of conversations with unread messages (for the header badge). */
messagesRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const [[row]] = await pool.execute(
      `SELECT COUNT(DISTINCT m.listing_id, m.sender_id) AS count
         FROM messages m WHERE m.recipient_id = ? AND m.read_at IS NULL`,
      [req.user.id],
    );
    res.json({ count: Number(row.count) });
  }),
);

/** Opens a conversation and marks the other person's messages as read. */
messagesRouter.get(
  '/:listingId/:buyerId',
  asyncHandler(async (req, res) => {
    const listingId = parseInput(idSchema, req.params.listingId);
    const buyerId = parseInput(idSchema, req.params.buyerId);
    const me = req.user.id;
    const { listing, sellerId, buyer } = await resolveConversation(pool, me, listingId, buyerId);

    const [messages] = await pool.execute(
      `SELECT m.id, m.sender_id, m.content, m.sent_at FROM messages m WHERE ${IN_CONVERSATION} ORDER BY m.id`,
      conversationParams(listingId, buyerId, sellerId),
    );
    // A buyer may open an empty conversation only for an available listing (to start one).
    if (messages.length === 0 && (me === sellerId || !AVAILABLE.includes(listing.status))) {
      throw new HttpError(404, 'This conversation does not exist.');
    }
    const [read] = await pool.execute(
      `UPDATE messages m SET m.read_at = UTC_TIMESTAMP()
        WHERE ${IN_CONVERSATION} AND m.recipient_id = ? AND m.read_at IS NULL`,
      [...conversationParams(listingId, buyerId, sellerId), me],
    );
    // Lets the reader's other open tabs update their unread badge.
    if (read.affectedRows > 0) emitMessagesChanged([me], { listingId, buyerId });

    const other = me === buyerId ? { name: listing.seller_name, status: listing.seller_status } : { name: buyer.name, status: buyer.account_status };
    res.json({
      listing: { id: Number(listing.id), title: listing.title, price: Number(listing.price), status: listing.status },
      otherName: other.name,
      canSend: AVAILABLE.includes(listing.status) && other.status === 'active',
      messages: messages.map((m) => ({
        id: Number(m.id),
        content: m.content,
        sentAt: m.sent_at,
        isMine: Number(m.sender_id) === me,
      })),
    });
  }),
);

/** Sends a message. Buyers can start a conversation; sellers can only reply to one. */
messagesRouter.post(
  '/:listingId/:buyerId',
  perUserLimit({ windowMinutes: 1, limit: 30, message: 'You are sending messages too quickly. Please wait a moment.' }),
  asyncHandler(async (req, res) => {
    const listingId = parseInput(idSchema, req.params.listingId);
    const buyerId = parseInput(idSchema, req.params.buyerId);
    const { content } = parseInput(contentSchema, req.body);
    const me = req.user.id;

    const { message, recipientId } = await withTransaction(async (conn) => {
      const { listing, sellerId, buyer } = await resolveConversation(conn, me, listingId, buyerId);
      if (!AVAILABLE.includes(listing.status)) {
        throw new HttpError(409, 'Messaging is unavailable because this listing is no longer available.');
      }
      const recipientId = me === buyerId ? sellerId : buyerId;
      const recipientStatus = me === buyerId ? listing.seller_status : buyer.account_status;
      if (recipientStatus !== 'active') throw new HttpError(409, 'This student cannot be contacted right now.');
      if (me === sellerId) {
        const [[existing]] = await conn.execute(
          `SELECT 1 AS found FROM messages m WHERE ${IN_CONVERSATION} LIMIT 1`,
          conversationParams(listingId, buyerId, sellerId),
        );
        if (!existing) throw new HttpError(403, 'Sellers can reply to buyers who contacted them.');
      }
      const [result] = await conn.execute(
        'INSERT INTO messages (listing_id, sender_id, recipient_id, content) VALUES (?, ?, ?, ?)',
        [listingId, me, recipientId, content],
      );
      const [[row]] = await conn.execute('SELECT id, content, sent_at FROM messages WHERE id = ?', [result.insertId]);
      return { message: row, recipientId };
    });

    // Only after the message is saved: the recipient (and the sender's other tabs) reload the conversation.
    emitMessagesChanged([recipientId, me], { listingId, buyerId });
    res.status(201).json({ message: { id: Number(message.id), content: message.content, sentAt: message.sent_at, isMine: true } });
  }),
);
