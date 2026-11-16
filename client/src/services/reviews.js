// Ratings and reviews service (UC-06) — real API since Sprint 3.
// Approved rule (docs/business-rules.md): anyone but yourself, once per seller per listing.
import { api } from '../api.js';

export async function listReviews(_me, userId) {
  const data = await api(`/users/${encodeURIComponent(userId)}/reviews`);
  return data.reviews;
}

export async function addReview(_me, { revieweeId, listingId, rating, comment }) {
  const data = await api('/reviews', { method: 'POST', body: { revieweeId, listingId, rating, comment } });
  return data.review;
}
