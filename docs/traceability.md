# CampusBazaar requirements traceability

Links every requirement to the code that implements it and the evidence that it works.
Last checked: **15 November 2026**, after Sprint 4.

- **Automated tests:** `server/test/*.test.js` — 134 tests, all passing, run against a real MySQL 8.0 database (`cd server && npm test`).
- **Manual browser checks:** done for each sprint in a local test environment (desktop and 375 px phone width).
- **Client automated tests:** `client/src/test/*.test.{js,jsx}` — 28 tests (login popup, Sell form, Start auction form, bidding, browse filters, banner carousel, services, formatting) (`cd client && npm test`).

## Functional requirements (SRS)

| FR | Use case | API (server) | Page (client) | Evidence |
|---|---|---|---|---|
| FR-01 View Profile | UC-01 | `GET /api/profile` | Profile | `profile.test.js`: requires sign-in; shows own info; activity calculated from listings and reviews; suspended user blocked on next request |
| FR-02 Create Listing | UC-02 | `POST /api/listings` (multipart, ≤5 photos) | Sell an item | `listings.test.js` › UC-02: owned by the signed-in seller; price required, optional "negotiable" flag; browser-sent seller id ignored; every invalid field reported; invalid prices; unknown category; JPG/PNG stored and served; fake image rejected and nothing saved; >5 photos rejected |
| FR-03 View Listings | UC-03 | `GET /api/listings`, `GET /api/listings/:id` | Home, browse, listing details | `listings.test.js` › UC-03/04: only available listings shown; removed/deleted/sold/ended-auction hidden; details with photos and seller rating; unavailable listing hidden from others |
| FR-04 Search and Filter | UC-04 | `GET /api/listings?q=&category=&condition=&min=&max=&sort=&page=` | Header search, browse filters | `listings.test.js`: every word searched; `%`/`_` treated literally; category, condition, price range, price sort; invalid filters rejected; paging |
| FR-05 Contact Seller / Send Message | UC-05 | `GET /api/messages/conversations`, `GET`/`POST /api/messages/:listingId/:buyerId`, `GET /api/messages/unread-count` | Messages, header badge | `messages.test.js`: buyer starts, seller replies; recipient set by server; unread tracking; strangers blocked; empty/long messages rejected; history kept but sending blocked when listing unavailable or seller suspended |
| FR-06 Rate and Review | UC-06 | `GET /api/users/:id/reviews`, `POST /api/reviews` | Reviews section on listing details | `reviews.test.js`: review added and shown in profile activity; once per seller per listing; no self-review; only the listing's seller; invalid ratings; long comments |
| FR-07 Start Auction | UC-07 | `POST /api/auctions` | Start auction | `auctions.test.js` › UC-07/08: server-set times; listing moves into auction; browser end time ignored; only own active listing, once; listing locked for editing |
| FR-08 Set Auction Details | UC-08 | `POST /api/auctions` (starting price, increment, duration) | Start auction | `auctions.test.js`: invalid starting price, increment and duration reported; starting price above the listed price refused. `StartAuction.test.jsx`: pre-filled prices, suggested increment, explanation |
| FR-09 Place Bid / Participate | UC-09 | `POST /api/auctions/:id/bids`, `GET /api/auctions`, `GET /api/auctions/:id`, Socket.IO `auction:changed` | Auctions, live auction page | `auctions.test.js` › UC-09: starting-price and increment rules (incl. paise); invalid amounts; seller cannot bid; late bid rejected; **exactly one of 8 simultaneous equal bids accepted**; **concurrent bids each beat the previous by the increment**; real-time event sent only after the bid is saved |
| FR-10 View Reports | UC-10 | `POST /api/reports`, `GET /api/admin/reports`, `POST /api/admin/reports/:id/resolve` | Report dialog, admin Reports | `moderation.test.js`: admin-only; lists reports with listing and student details; validation |
| FR-11 Remove Listings / Handle Complaints | UC-11 | `POST /api/complaints`, `GET /api/admin/complaints`, `POST /api/admin/complaints/:id/resolve` | Report dialog, admin Complaints | `moderation.test.js`: remove listing + close with both actions recorded; close without action; no removal during an active auction; complaint handling |
| FR-12 Manage Users | UC-12 | `GET /api/admin/users`, `PATCH /api/admin/users/:id/status` | Manage users | `admin.test.js`: admin-only (and immediately revoked when role removed); list/filter; suspend records action and blocks the session; reactivate; no self or admin suspension |

### Use-case diagram items without an FR number

| Item | Implementation | Evidence |
|---|---|---|
| University email verification (authentication direction) | `POST /api/auth/register`, `/complete-registration`, `/sign-in`, `/sign-out`, `GET /api/auth/me` | `auth.test.js`: 18 tests (domain check, hashed one-time token, expiry, no account enumeration, resend cooldown, sessions) |
| Public home page (signed-out visitors) | `GET /api/public/home`, signed-out Home, login popup | `public.test.js`: works without sign-in; only card fields (no seller, email or description); hides unavailable listings; live auctions ending soonest; all other routes still 401 |
| Edit/Delete Listing | `PUT /api/listings/:id`, `DELETE /api/listings/:id`, My listings | `listings.test.js` › Edit and delete: seller only, active only; photo keep/replace/delete on disk |
| View Bids | Bid history on `GET /api/auctions/:id` | `auctions.test.js`: seller sees names; other students see initials |
| Receive Winner Notification | Settlement job (`server/src/auctions/settle.js`), `/api/notifications*`, Socket.IO `notifications:changed` | `auctions.test.js` › ending: winner recorded, listing sold, only winner notified, idempotent; no-bid auction; settles when viewed; socket notification |

## Non-functional requirements (proposed — not yet in the SRS)

| NFR | How it is met | Evidence | Status |
|---|---|---|---|
| NFR-01 University-only access, hashed passwords | Allowed-domain check; bcrypt; account created only via emailed one-time link | `auth.test.js` | Met |
| NFR-02 Authorization on the server | `requireAuth`/`requireRole` on every route; ownership checks in SQL transactions; status and roles re-read each request | 403/401 tests in every test file | Met |
| NFR-03 Input validation, parameterized SQL, upload limits, rate limits | zod on every input; only `?` placeholders; photos checked by file bytes, 5 MB / 5 files; per-IP and per-user rate limits | Validation and upload tests | Met — rate limits are switched off in tests, so they are not covered automatically |
| NFR-04 Auction integrity | Row lock (`FOR UPDATE`) per bid; checks against saved state; DB `CHECK` constraints; settlement under lock | Concurrency tests (repeated 3 extra times) | Met |
| NFR-05 Real-time bids (≈1 s) | Socket.IO broadcast after commit; page re-fetches | Socket test; browser check showed the seller's page updating without reload | Met functionally; latency not formally measured |
| NFR-06 Privacy | Students see names, never other students' emails; bidder names masked except for the seller | Bidder-masking test; API responses reviewed | Met by design; no dedicated email-exposure test |
| NFR-07 Performance (< 2 s) | Indexed queries, 24 results per page | Local measurement with 5,000 listings: searches/filters 0.02–0.07 s, unfiltered page ≈0.4–0.5 s, details 0.03 s | Met locally; not measured on hosting |
| NFR-08 Usability | Responsive layout; every use-case alternate flow shows a message | Browser checks at desktop and phone width | Met manually; no automated UI tests |
| NFR-09 Cost (free tier / ≈₹500 per month) | Single Node server + MySQL; photos on disk | — | Not verifiable until deployment |
| NFR-10 Maintainability | ESLint (0 errors), 134 server tests, secrets only in `.env` | `npm run lint`, `npm test` | Met — 134 server and 28 client tests; client has 2 lint warnings (fast-refresh hints only) |

## Gaps and open items

1. **NFRs are not in the SRS yet.** The table above uses the NFR list proposed before Sprint 1; the team should confirm it and add it to the SRS.
2. ~~Client automated tests~~ — added 16 Nov 2026 (now 28 tests). Pages not yet covered: messaging, admin, profile, notifications.
3. **Rate limits** are not covered by automated tests (they are disabled in the test environment).
4. ~~Open product decisions~~ — resolved 16 Nov 2026: no-bid auctions put the listing back on sale; suspended students' listings are hidden while suspended (`docs/business-rules.md`).
5. **Deployment is not done:** choose hosting and an SMTP provider; use HTTPS (secure cookies switch on with `NODE_ENV=production`); keep `server/uploads/` on persistent storage; if the client is hosted on a different domain, CORS for the REST API is needed.
6. **Single server process assumed:** the settlement timer is safe with several processes (row locks), but Socket.IO would need a shared adapter (for example Redis) to broadcast across processes.
7. **Out of scope by project rules:** payment, escrow, shipping and dispute workflows after an auction.
