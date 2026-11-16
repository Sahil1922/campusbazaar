import { Server } from 'socket.io';
import { config } from './config.js';
import { SESSION_COOKIE, loadUser, userIdFromToken } from './auth/session.js';

// Real-time updates (Socket.IO). Events carry only ids: clients re-fetch the details over the
// authenticated REST API, so the database stays the single source of truth for auction state.
//   auction:changed        { auctionId }           — to everyone watching that auction
//   messages:changed       { listingId, buyerId }  — to the two people in that conversation
//   notifications:changed  {}                      — to one user
let io = null;

function readCookie(header, name) {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
    serveClient: false,
  });

  // Only signed-in, active students can connect (same session cookie as the REST API).
  io.use(async (socket, next) => {
    try {
      const userId = userIdFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
      const user = userId ? await loadUser(userId) : null;
      if (!user || user.accountStatus !== 'active') return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.on('auction:watch', (auctionId) => {
      const id = Number(auctionId);
      if (Number.isSafeInteger(id) && id > 0) socket.join(`auction:${id}`);
    });
    socket.on('auction:unwatch', (auctionId) => socket.leave(`auction:${Number(auctionId)}`));
  });
  return io;
}

/** Call only after the change is committed to the database. */
export function emitAuctionChanged(auctionId) {
  io?.to(`auction:${auctionId}`).emit('auction:changed', { auctionId: Number(auctionId) });
}

/** A conversation changed (new message, or messages read). Payload: { listingId, buyerId }. */
export function emitMessagesChanged(userIds, { listingId, buyerId }) {
  if (!io) return;
  const payload = { listingId: Number(listingId), buyerId: Number(buyerId) };
  for (const userId of new Set(userIds)) io.to(`user:${userId}`).emit('messages:changed', payload);
}

export function emitNotificationsChanged(userId) {
  io?.to(`user:${userId}`).emit('notifications:changed', {});
}

/** Closes Socket.IO and the HTTP server it is attached to. */
export function closeRealtime() {
  const current = io;
  io = null;
  return new Promise((resolve) => (current ? current.close(() => resolve()) : resolve()));
}
