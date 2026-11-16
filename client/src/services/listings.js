// Listings service (UC-02, UC-03, UC-04, Edit/Delete Listing) — real API since Sprint 2.
// The `me` argument is kept so every service has the same shape; the server identifies the
// user from the session cookie and enforces ownership itself.
import { api } from '../api.js';

export async function listCategories() {
  const data = await api('/categories');
  return data.categories;
}

/** UC-03/UC-04. Returns { listings, total, page, pageSize }. */
export async function searchListings(_me, { q, category, conditions = [], minPrice, maxPrice, sort, page } = {}) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  if (conditions.length) params.set('condition', conditions.join(','));
  if (minPrice !== undefined && minPrice !== '') params.set('min', minPrice);
  if (maxPrice !== undefined && maxPrice !== '') params.set('max', maxPrice);
  if (sort && sort !== 'newest') params.set('sort', sort);
  if (page && page > 1) params.set('page', page);
  return api(`/listings?${params}`);
}

export async function getListing(_me, id) {
  const data = await api(`/listings/${encodeURIComponent(id)}`);
  return data.listing;
}

export async function myListings() {
  const data = await api('/listings/mine');
  return data.listings;
}

/**
 * Builds the multipart form. `images` is a list of { id } for photos already saved and
 * { file } for new ones chosen in the browser.
 */
function toFormData(input) {
  const form = new FormData();
  for (const key of ['title', 'description', 'categoryId', 'condition', 'price']) form.set(key, input[key] ?? '');
  form.set('priceNegotiable', input.priceNegotiable ? 'true' : 'false');
  const images = input.images ?? [];
  form.set('keepImageIds', images.filter((img) => img.id).map((img) => img.id).join(','));
  for (const img of images) if (img.file) form.append('images', img.file);
  return form;
}

export async function createListing(_me, input) {
  const data = await api('/listings', { method: 'POST', body: toFormData(input) });
  return data.listing;
}

export async function updateListing(_me, id, input) {
  const data = await api(`/listings/${encodeURIComponent(id)}`, { method: 'PUT', body: toFormData(input) });
  return data.listing;
}

export async function deleteListing(_me, id) {
  await api(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
