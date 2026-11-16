// Auctions service (UC-07, UC-08, UC-09, View Bids) — real API since Sprint 4.
// The server is authoritative for status, current bid, end time and winner; this file only
// sends requests and listens for "something changed" events over Socket.IO.
import { api } from '../api.js';
import { watchAuction } from '../lib/socket.js';

// Approved duration choices (docs/business-rules.md); the server checks them too.
export const DURATIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 6, label: '6 hours' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

/**
 * Suggested bid increment: about 5% of the starting price, rounded to a tidy amount
 * (whole rupees under ₹10, multiples of ₹5 under ₹100, otherwise multiples of ₹10). Never below ₹1.
 */
export function suggestIncrement(startingPrice) {
  const price = Number(startingPrice);
  if (!Number.isFinite(price) || price <= 0) return '';
  const raw = price * 0.05;
  const step = raw < 10 ? 1 : raw < 100 ? 5 : 10;
  return String(Math.max(1, Math.round(raw / step) * step));
}

export async function listAuctions(_me, { status = 'active' } = {}) {
  const data = await api(`/auctions?status=${encodeURIComponent(status)}`);
  return data.auctions;
}

export async function getAuction(_me, id) {
  const data = await api(`/auctions/${encodeURIComponent(id)}`);
  return data.auction;
}

export async function startAuction(_me, listingId, { startingPrice, bidIncrement, durationHours }) {
  const data = await api('/auctions', {
    method: 'POST',
    body: { listingId: Number(listingId), startingPrice, bidIncrement, durationHours: durationHours === '' ? '' : Number(durationHours) },
  });
  return data.auction;
}

export async function placeBid(_me, auctionId, amount) {
  const data = await api(`/auctions/${encodeURIComponent(auctionId)}/bids`, { method: 'POST', body: { amount } });
  return data.auction;
}

/** Calls `callback` whenever the server reports a change to this auction; returns an unsubscribe function. */
export function subscribe(auctionId, callback) {
  return watchAuction(auctionId, callback);
}
