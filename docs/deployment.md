# Deploying CampusBazaar

CampusBazaar runs as **one Node.js process** that serves the API, the built React website and Socket.IO
live updates on a single address, plus a **MySQL 8** database. This guide is host-independent; the
feasibility report plans cloud hosting on student credits or a free tier with a third-party email service.

## What the host must provide

| Need | Why |
|---|---|
| Node.js **22 LTS or 24 LTS** | Long-term-support versions are what hosts run. (Local development on Node 23 works, but 23 is not an LTS release.) |
| MySQL **8.0.16 or newer** (managed or self-run) | The schema uses `CHECK` constraints and `SELECT … FOR UPDATE OF`. |
| HTTPS on your domain | Session cookies are `Secure` in production and only travel over HTTPS. Most hosts terminate HTTPS in a proxy for you. |
| WebSocket support | Live auction updates use Socket.IO (it falls back to long-polling if WebSockets are blocked). |
| A **persistent disk** (or folder) for photos | Listing photos are saved to `UPLOAD_DIR`. Many free tiers wipe the disk on every restart or deploy — photos would disappear. |
| An SMTP email account | Verification links are emailed; the server refuses to start in production without `SMTP_HOST`. |
| A single always-on instance | The auction-ending timer and Socket.IO rooms assume one process. Running several needs a shared Socket.IO adapter (e.g. Redis) — not set up. Servers that "sleep" when idle delay auction endings until they wake (endings are also settled whenever an auction is viewed). |

## Build and start commands

From the repository root:

```bash
npm ci --prefix server --omit=dev
```
```bash
npm ci --prefix client
```
```bash
npm run build --prefix client
```

Start (with `NODE_ENV=production` set):

```bash
npm start --prefix server
```

The server listens on `PORT` and serves `client/dist`. Health check URL: `/api/health`.

## Environment variables (production)

Set these in the host's settings — never commit them. `server/.env.example` lists them all.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Whatever the host gives you (often provided automatically) |
| `CLIENT_ORIGIN` | Your site's address, e.g. `https://campusbazaar.example.org` (used in verification links) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | From your MySQL provider; use a user limited to the CampusBazaar database |
| `JWT_SECRET` | New random value, at least 32 characters — **not** the one from your laptop: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ALLOWED_EMAIL_DOMAINS` | `uohyd.ac.in` (plus any student sub-domains, comma-separated) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | From your email provider; port 465 uses TLS directly, 587 uses STARTTLS |
| `UPLOAD_DIR` | A folder on the persistent disk, e.g. `/data/uploads` |
| `TRUST_PROXY` | `1` when the host puts an HTTPS proxy in front of the app (almost always); `0` otherwise |
| `SERVE_CLIENT` | Leave empty (defaults to `true` in production) |

## First deployment

1. **Database:** create a database `campusbazaar` and a user with rights only on it (same SQL as in
   `README.md`, with the host your provider requires instead of `localhost`).
2. **Tables:** run `npm run db:setup --prefix server` once with the production variables set (from the
   host's shell, or from your computer if the database accepts outside connections).
3. **Deploy** with the build and start commands above, then open `https://your-domain/api/health`.
4. **Email check:** register with a real `@uohyd.ac.in` address and confirm the verification email arrives
   (check spam). Fix the SMTP settings if the server log shows a sending error.
5. **Administrator:** from the host's shell, run
   `npm run make-admin --prefix server -- you@uohyd.ac.in`.
6. **Smoke test:** sell an item with a photo, restart the app, and check the photo still loads (proves the
   disk is persistent). Start a 1-hour auction with a second account and place a bid; the seller's page
   should update live.

## Updating after changes

```bash
git pull
```

Then repeat the build commands, run `npm run db:setup --prefix server` (safe to re-run; it adds new tables,
columns and indexes and upgrades older databases) and restart the app.

## Backups

- **Database:** schedule daily dumps (most managed MySQL services offer automatic backups), e.g.
  `mysqldump --single-transaction campusbazaar > backup.sql`.
- **Photos:** back up the `UPLOAD_DIR` folder; database rows point to these files.

## Choosing a host — what to check

The team still needs to pick a host and an email provider. For each candidate, check:

- Node.js LTS support and a start command you control.
- Managed MySQL 8 (or the ability to run it), and whether the free tier expires or limits size.
- A persistent disk for `UPLOAD_DIR` on the plan you will use.
- WebSockets allowed, and whether the app sleeps when idle.
- Custom domain with free HTTPS.
- For email: daily sending limit, and whether you must verify the sender address or domain. Ask whether the
  university IT department offers an SMTP relay for `uohyd.ac.in` — emails from the university's own
  domain are less likely to land in spam.

## Launch checklist

- [ ] `NODE_ENV=production`, new `JWT_SECRET`, `CLIENT_ORIGIN` is `https://…`
- [ ] `TRUST_PROXY` set to match the host (usually `1`)
- [ ] `UPLOAD_DIR` on a persistent disk; photo survives a restart
- [ ] Verification email arrives from the real SMTP provider
- [ ] `/api/health` returns `{"status":"ok"}`
- [ ] Administrator account created with `make-admin`
- [ ] Live bid update seen between two accounts
- [ ] Database and photo backups scheduled
- [ ] Only one app instance running
