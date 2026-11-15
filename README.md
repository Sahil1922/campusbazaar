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

The full 14-table schema is in [server/db/schema.sql](server/db/schema.sql). Listings, messaging, reviews,
moderation and auctions come in Sprints 2–4.

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
