// Which parts of the marketplace are backed by the real server. Each sprint switches its part on.
// While a part is off, actions that would mix real listings with sample data are disabled.
export const features = Object.freeze({
  listings: true, // Sprint 2
  messaging: true, // Sprint 3 — Contact seller
  moderation: true, // Sprint 3 — Report a listing, admin reports/complaints
  reviews: true, // Sprint 3
  auctions: true, // Sprint 4 — Start auction, bidding, winner notifications
});
