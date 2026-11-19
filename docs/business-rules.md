# CampusBazaar business rules not covered by the SRS

The SRS and use-case specifications leave these rules open. The project team approved them on
**15 November 2026** (listing conditions and photo storage were confirmed the same day for Sprint 2). The server must enforce them when Sprints 2–4 are implemented; the client's sample
services (`client/src/services/`) already follow them.

If any rule changes, update this file, the server and the matching client service together.

## Auctions (UC-07, UC-08, UC-09)

| Rule | Detail |
|---|---|
| Starting price | Set by the seller (FR-08), pre-filled with the listed price, and **may not be higher than the listed price** (approved 16 November 2026). The listed price is hidden while the auction runs and is used again if the auction ends with no bids. |
| Increment suggestion | The form suggests about 5% of the starting price, rounded to a tidy amount (whole ₹ under ₹10, multiples of ₹5 under ₹100, otherwise multiples of ₹10); the seller can change it (approved 16 November 2026). |
| First bid | Must be at least the starting price. |
| Later bids | Must be at least the current bid **plus** the bid increment. |
| Maximum bid | A bid may be **at most 10 times the minimum bid** (and never more than ₹10,00,000), so nobody can leap to an absurd amount in one go and disturb the auction (approved 19 November 2026). |
| Big-bid confirmation | The auction page asks the bidder to confirm before placing a bid of 3 times the minimum bid or more: "Bids are binding. Continue?" (approved 19 November 2026; the 3× threshold was an implementation choice). |
| Timing | A bid is accepted only before the server-side end time. |
| Seller | A seller cannot bid on their own auction. |
| Sold | When an auction ends with a winner, its listing is marked sold (approved 15 November 2026). |
| No bids | When an auction ends with no bids, its listing goes back on sale at its listed price; the seller can edit it, sell it normally or start a new auction (approved 16 November 2026). |
| Durations | 1 hour, 6 hours, 12 hours, 1 day, 3 days or 7 days. The server sets the end time as start time + duration. |
## Listings (UC-02, UC-03, UC-04)

- **Categories:** Books, Electronics, Furniture, Clothing, Sports, Stationery, Other.
- **Conditions:** New, Like new, Good, Fair, Poor.
- **Photos:** optional, at most 5 per listing, JPG/PNG/WebP, 5 MB each, stored on the server's disk.
- **Price:** ₹1 to ₹10,00,000, up to 2 decimals. A price is always required (SRS FR-02), so price search,
  filters and sorting (FR-04) work for every listing.
- **Negotiable price** (approved 16 November 2026): the seller may tick "Price is negotiable". The price is
  still shown, with a "Negotiable" tag, and buyers are pointed to Contact seller to make an offer. Hiding the
  price ("price on request") was considered and not chosen.
- A seller can edit or delete a listing only while it is active (not in an auction or sold).
- Deleting a listing hides it everywhere; the record is kept so messages and reports about it still make sense.

## Public home page (approved 16 November 2026)

- Signed-out visitors see a home page with banners, categories and **cards** of the 12 newest listings and the
  6 live auctions ending soonest: photo, title, price, Negotiable tag, condition, category and auction price/time.
- Seller names, descriptions, listing and auction pages, search, filters, messaging, reviews, reports, selling
  and bidding all require sign-in. Trying any of them opens a login popup and, after signing in, continues to
  what the visitor wanted.
- Served by `GET /api/public/home` (rate-limited to 60 requests per minute per IP). Every other API route still
  requires sign-in.

## Reviews (UC-06)

Until "eligible interaction" is defined, any student may review any other student, but not themselves,
and only once per seller per listing.

## Reports and complaints (UC-10, UC-11)

- Reports and complaints stay separate (`reports` and `complaints` tables).
- **Report reasons:** Prohibited item, Fake or misleading, Spam, Offensive content, Other.
- **Complaint reasons:** Item not as described, Seller did not show up, Rude or unsafe behaviour, Other.
- An administrator cannot remove a listing while it has an active auction.

## Implementation choices (Sprint 3, not separately confirmed)

These follow from the use cases but were not spelled out; change them here if the team disagrees.

- **Messaging:** a buyer starts a conversation; the seller can only reply. Messages can be sent only while
  the listing is available and the other student's account is active (UC-05 A-1). Both students keep
  the conversation history afterwards.
- **Reports and complaints:** a student cannot report themselves or report/complain about their own listing.
- **Rate limits:** 30 messages per minute and 20 reviews, reports or complaints per hour per student.

## Implementation choices (Sprint 4, not separately confirmed)

- **Amounts:** starting price, increment and bids are ₹1 to ₹10,00,000 with up to 2 decimals (the listing price limit).
- **Ending:** the server ends an auction at its end time (checked every 5 seconds and whenever it is viewed)
  and records the highest bidder as winner. Only the winner is notified. With no bids there is no winner.
- **Bidding:** a student who already holds the highest bid may raise it. Rate limit: 30 bids per minute.
- **Bid history:** the seller sees bidder names; other students see each bidder's initials.

## Suspended students (approved 16 November 2026)

- While a student is suspended, their listings are hidden from browsing, search, listing pages and the public
  home page. They reappear if the student is reactivated.
- Their auctions that are already running continue; bids already placed are kept.
- Messaging a suspended student is blocked (see Sprint 3 choices).

## Still to confirm

Nothing open at the moment.
