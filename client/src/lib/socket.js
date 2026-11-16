import { io } from 'socket.io-client';

// One shared Socket.IO connection, authenticated by the session cookie. Events only say *what*
// changed; pages then re-fetch from the REST API, which is the source of truth.
let socket = null;
const watched = new Map(); // auctionId -> number of watchers

export function getSocket() {
  if (!socket) {
    socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    // Re-join auction rooms after a reconnect.
    socket.on('connect', () => {
      for (const id of watched.keys()) socket.emit('auction:watch', id);
    });
  }
  return socket;
}

/** Closes the connection (e.g. on sign-out or when a different user signs in). */
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  watched.clear();
}

export function watchAuction(auctionId, onChange) {
  const id = Number(auctionId);
  const s = getSocket();
  watched.set(id, (watched.get(id) ?? 0) + 1);
  s.emit('auction:watch', id);
  const handler = (payload) => payload?.auctionId === id && onChange();
  s.on('auction:changed', handler);
  return () => {
    s.off('auction:changed', handler);
    const count = (watched.get(id) ?? 1) - 1;
    if (count <= 0) {
      watched.delete(id);
      s.emit('auction:unwatch', id);
    } else {
      watched.set(id, count);
    }
  };
}

export function onNotificationsChanged(listener) {
  const s = getSocket();
  s.on('notifications:changed', listener);
  return () => s.off('notifications:changed', listener);
}

/** listener({ listingId, buyerId }) runs when a conversation the user is in gets a new message or is read. */
export function onMessagesChanged(listener) {
  const s = getSocket();
  s.on('messages:changed', listener);
  return () => s.off('messages:changed', listener);
}
