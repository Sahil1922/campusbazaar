# CampusBazaar

A marketplace for university students to buy, sell and auction items.
React + CSS (`client/`), Node.js + Express (`server/`), MySQL 8.

## Status

**Sprint 1 — accounts** is implemented:

| Requirement | What exists |
|---|---|
| University email verification | Register with an allowed university email → verification link → choose name and password |
| FR-01 View Profile (UC-01) | `GET /api/profile` and the Profile page (own info + marketplace activity) |
| FR-12 Manage Users (UC-12) | `GET /api/admin/users`, `PATCH /api/admin/users/:id/status` and the Manage users page (admins only) |
| Roles | Every student gets Buyer + Seller; Administrator is granted with `npm run make-admin` |

**Sprint 2 — listings** is implemented:

| Requirement | What exists |
|---|---|
| UC-02 Create Listing | `POST /api/listings` (multipart, up to 5 JPG/PNG/WebP photos of 5 MB) and the Sell page |
| UC-03 View Listings | `GET /api/listings/:id`, listing cards and the details page; only available listings are shown |
| UC-04 Search and Filter | `GET /api/listings?q=&category=&condition=&min=&max=&sort=&page=` and the browse page |
| Edit/Delete Listing | `PUT /api/listings/:id`, `DELETE /api/listings/:id` (seller only, active listings only), My listings page |
| Categories | `GET /api/categories` (seeded by `db:setup`) |
| Public home page | `GET /api/public/home` — card details only, for signed-out visitors; everything else asks them to log in |

Photos are saved in `server/uploads/` (set `UPLOAD_DIR` to change it) and served at `/uploads/…`.

**Sprint 3 — messaging, reviews and moderation** is implemented:

| Requirement | What exists |
|---|---|
| UC-05 Contact Seller / Send Message | `GET /api/messages/conversations`, `GET`/`POST /api/messages/:listingId/:buyerId`, `GET /api/messages/unread-count`, Messages page and header badge |
| UC-06 Rate and Review | `GET /api/users/:id/reviews`, `POST /api/reviews`, reviews section on listing pages |
| UC-10 View Reports | `POST /api/reports`, `GET /api/admin/reports`, `POST /api/admin/reports/:id/resolve`, admin Reports page |
| UC-11 Remove Listings / Handle Complaints | `POST /api/complaints`, `GET /api/admin/complaints`, `POST /api/admin/complaints/:id/resolve`, admin Complaints page; every admin action is recorded in `admin_actions` |

**Sprint 4 — live auctions** is implemented:

| Requirement | What exists |
|---|---|
| UC-07/UC-08 Start Auction, Set Auction Details | `POST /api/auctions` (seller's own active listing; the server sets start and end times), Start auction page |
| UC-09 Place Bid / Participate in Auction | `POST /api/auctions/:id/bids`, `GET /api/auctions`, `GET /api/auctions/:id`, live auction page |
| View Bids | Bid history on the auction page; the seller sees bidder names, other students see initials |
| Receive Winner Notification | Server job ends due auctions every 5 s and notifies the winner; `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/read-all` |
| Real-time updates | Socket.IO on the API server (`auction:changed`, `messages:changed`, `notifications:changed`), authenticated with the session cookie; new messages and unread badges update without a refresh |

**How a bid is processed:** the auction row is locked (`SELECT … FOR UPDATE`), the bid is checked against
the saved status, end time and current bid, the bid is stored and the auction updated, the transaction
commits, and only then is `auction:changed` broadcast. Clients then re-fetch the auction from the API.
The server tests include simultaneous bids (exactly one of several equal bids is accepted).

The sample data used while building the frontend has been removed; every page now uses the server.

Which code and tests cover each requirement, plus known gaps: [docs/traceability.md](docs/traceability.md).

Deploying to a server (build/start commands, production settings, launch checklist): [docs/deployment.md](docs/deployment.md).
Step-by-step for the chosen host, Railway: [docs/railway-deployment.md](docs/railway-deployment.md) (alternative: [Azure for Students](docs/azure-deployment.md)).

Rules the SRS leaves open (bid minimums, durations, categories, review and moderation rules) are in
[docs/business-rules.md](docs/business-rules.md). The full 14-table schema is in
[server/db/schema.sql](server/db/schema.sql).

After pulling schema changes, run `npm run db:setup` again in `server/`; it adds what is missing and
upgrades older databases.

## Setup

Requires Node.js 20+ and MySQL 8.0.16+.

1. Create a MySQL user for the app (in MySQL Workbench or the `mysql` client, as an admin user):

   ```sql
   CREATE USER 'campusbazaar_app'@'localhost' IDENTIFIED BY 'choose-a-password';
   GRANT ALL PRIVILEGES ON campusbazaar.* TO 'campusbazaar_app'@'localhost';
   ```

2. Configure the server: copy `server/.env.example` to `server/.env` and fill in `DB_PASSWORD`,
   `JWT_SECRET` and `ALLOWED_EMAIL_DOMAINS` (your university's email domain).

3. Install and create the tables:

   ```bash
   cd server && npm install && npm run db:setup
   ```

   ```bash
   cd client && npm install
   ```

4. Run the API (port 4000) and the client (port 5173) in two terminals:

   ```bash
   cd server && npm run dev
   ```

   ```bash
   cd client && npm run dev
   ```

   Open http://localhost:5173. Without `SMTP_HOST`, verification emails are printed in the API terminal.

5. Make your account an administrator (after registering it):

   ```bash
   cd server && npm run make-admin -- you@youruniversity.ac.in
   ```

## Checks

| Where | Command | Notes |
|---|---|---|
| server | `npm test` | Integration tests against a real MySQL test database (see below) |
| server | `npm run lint` | |
| client | `npm test` | Component and unit tests (Vitest + React Testing Library, jsdom) |
| client | `npm run lint` | |
| client | `npm run build` | |

The server tests **drop and recreate** a database called `campusbazaar_test` (the name must end in
`_test`). By default they connect to `root` with no password on `127.0.0.1:3307`. Point them at your own
MySQL with `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD` and `TEST_DB_NAME`.

## Security notes

- Passwords are hashed with bcrypt; verification tokens are stored only as SHA-256 hashes.
- Sessions are signed tokens in an `HttpOnly`, `SameSite=Strict` cookie. Account status and roles are
  re-read from the database on every request, so suspensions take effect immediately.
- All SQL is parameterized; all input is validated on the server with zod.
- Registration and sign-in are rate-limited; registration responses don't reveal whether an email has an account.
