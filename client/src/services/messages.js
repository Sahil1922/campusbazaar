// Messaging service (UC-05 Contact Seller / Send Message) — real API since Sprint 3.
// A conversation is identified by its listing and its buyer.
import { api } from '../api.js';
import { emitDataChange } from '../lib/events.js';

const path = (listingId, buyerId) => `/messages/${encodeURIComponent(listingId)}/${encodeURIComponent(buyerId)}`;

export async function listConversations() {
  const data = await api('/messages/conversations');
  return data.conversations;
}

/** Opens a conversation; the server marks the other person's messages as read. */
export async function getConversation(_me, listingId, buyerId) {
  const data = await api(path(listingId, buyerId));
  emitDataChange(); // Unread badge may have changed.
  return data;
}

export async function sendMessage(_me, listingId, buyerId, content) {
  const data = await api(path(listingId, buyerId), { method: 'POST', body: { content } });
  emitDataChange();
  return data.message;
}

export async function unreadConversationCount() {
  const data = await api('/messages/unread-count');
  return data.count;
}
