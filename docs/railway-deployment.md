# Deploying CampusBazaar on Railway

Railway builds the app from GitHub and runs it next to a managed MySQL database, with a volume for
listing photos. Verification emails go through **Brevo's HTTPS API**: Railway blocks outbound SMTP on its
Free, Trial and Hobby plans (SMTP needs the Pro plan), so `SMTP_HOST` will not work there.

| Part | Railway piece |
|---|---|
| Website + API + live updates (one Node.js process) | A service deployed from the GitHub repository |
| Database | Railway's MySQL service (private network, backups in its Backups tab) |
| Listing photos | A volume mounted at `/data` |
| Verification emails | Brevo transactional email API (`BREVO_API_KEY`) |

Read [deployment.md](deployment.md) first for what the app needs and the launch checklist. **Create the
accounts and choose every password and key yourself; never commit them.** Figures below were checked on
18 November 2026; confirm them on [Railway's pricing page](https://railway.com/pricing) before paying.

## Cost and plan

- **Trial:** a one-time $5 credit for 30 days, then the Free plan with $1/month. That is enough to try the
  deployment, not to keep the app and database running all month. Volumes are limited to 0.5 GB.
- **Hobby:** $5/month including $5 of usage, with 5 GB volumes. An always-on app plus MySQL may use a bit
  more than the included $5. Watch **Usage** in the first week and set a usage limit in the workspace
  settings.

## 1. Push the code to GitHub

Railway deploys what is on GitHub. Make sure the latest commit, including the root `package.json`, is
pushed to `main`.

## 2. Create the project and the database

1. Sign in at <https://railway.com> with GitHub.
2. **New Project → Deploy from GitHub repo** → choose the CampusBazaar repository. Railway starts a first
   build. It may fail because the settings are not there yet; that is expected.
3. In the project, click **Create → Database → MySQL**. Keep its name **MySQL**; the variables below
   refer to it by that name.

## 3. Configure the app service

Open the app service (named after the repository) → **Settings**:

| Setting | Value |
|---|---|
| Source → Root directory | Leave empty (the repository root) |
| Build → Builder | Railpack (default). It runs the root `package.json` `build` script, which installs the server, installs and builds the website |
| Deploy → Start command | Leave empty (uses `npm start` from the root `package.json`) |
| Deploy → Pre-deploy command | `npm run db:setup` (creates or upgrades the tables before each release; safe to repeat) |
| Deploy → Healthcheck path | `/api/health` |
| Deploy → Restart policy | On failure |
| Deploy → Replicas | 1 (the auction timer and live updates assume one process) |

Then **attach a volume**: right-click the app service on the project canvas → **Attach volume** → mount
path `/data`.

Then **Networking → Generate Domain**. If Railway asks for a port, enter `8080`. Note the address, e.g.
`campusbazaar-production.up.railway.app`.

## 4. Set up Brevo for email

1. Create a free account at <https://www.brevo.com/> (300 emails a day) and complete its account check.
2. **Senders, Domains & Dedicated IPs → Senders:** add and verify the address the emails will come from.
3. **SMTP & API → API Keys → Generate a new API key.** Copy it once; it is the `BREVO_API_KEY`.
4. **Settings → Security → Authorized IPs.** Brevo learns which IP addresses use the key and later blocks
   new ones. Railway's outgoing IP address can change between deployments, which would stop emails. Turn
   off blocking for API keys there, and keep the key only in Railway's variables. Alternatively, approve
   each new address when Brevo emails you about it.

Ask the university IT department whether they offer an email API or relay for `uohyd.ac.in` as well.
Emails from the university's own domain are less likely to land in spam.

## 5. Set the variables

App service → **Variables → Raw Editor**, paste and fill in:

```ini
NODE_ENV=production
PORT=8080
CLIENT_ORIGIN=https://<your-domain-from-step-3>
TRUST_PROXY=2

DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_SSL=false

JWT_SECRET=<new random value>
ALLOWED_EMAIL_DOMAINS=uohyd.ac.in
UPLOAD_DIR=/data/uploads

BREVO_API_KEY=<your Brevo API key>
EMAIL_FROM=CampusBazaar <your-verified-sender@example.com>
```

- `${{MySQL.…}}` are Railway references to the MySQL service; Railway fills them in. Leave them as written.
- `JWT_SECRET`: generate a new one on your computer and paste it:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `DB_SSL=false`: the app reaches MySQL over Railway's private network (`*.railway.internal`), which never
  leaves Railway. Don't turn on MySQL's public TCP proxy unless you need it.
- `TRUST_PROXY=2`: Railway's edge sets the visitor's IP in `X-Forwarded-For` and may pass the request through
  one or two proxies. A value of 2 makes rate limits see the visitor's real IP in both cases.

Click **Deploy** (or **Apply changes**). In **Deployments → View logs**, the pre-deploy step should print
`Database "<name>" is ready with 14 tables.`, then `CampusBazaar API listening …`.

## 6. Finish and test

1. Open `https://<your-domain>/api/health`; it should show `{"status":"ok"}`.
2. Register with your real `@uohyd.ac.in` address and confirm the email arrives (check spam). If it doesn't,
   the app's log shows `Brevo email API returned …` with Brevo's reason, usually an unverified sender or a
   blocked IP (step 4).
3. Make yourself administrator from a shell inside the running service. Install the Railway CLI
   (`npm install -g @railway/cli`), then in the project folder run `railway login`, `railway link`
   (choose the project and the app service) and `railway ssh`. In that shell run:
   ```bash
   npm run make-admin --prefix server -- you@uohyd.ac.in
   ```
4. Work through the **Launch checklist** in [deployment.md](deployment.md). The important checks: a photo
   still loads after a redeploy (proves the volume works), and a bid from a second account appears live.

## Updating after new commits

Push to `main`. Railway rebuilds, runs the pre-deploy table upgrade and switches over. With a volume
attached there is a short pause (a few seconds) during each switch, because only one copy may use the volume.

## Backups

- **Database:** MySQL service → **Backups**. Point-in-time recovery for the last 7 days can be turned on
  there.
- **Photos:** stored on the `/data` volume. Check the volume's backup options in Railway, or copy them out
  now and then from `railway ssh` (`tar czf - /data/uploads`).

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| Build fails at "vite: not found" | The build command was overridden. Leave it empty so the root `build` script runs (it installs the website's build tools even with `NODE_ENV=production`) |
| Deploy stops at pre-deploy | A database variable is wrong. Check the `${{MySQL.…}}` names match the MySQL service's name |
| Site loads but sign-in never sticks | `CLIENT_ORIGIN` is not the exact `https://` domain from step 3 |
| "Brevo email API returned 401" | Wrong key, or Brevo blocked Railway's IP (step 4) |
| "Brevo email API returned 400" | `EMAIL_FROM` is not a verified Brevo sender |
| Photos disappear after a deploy | The volume is missing, or `UPLOAD_DIR` is not under `/data` |
| Permission error writing photos | Add the variable `RAILWAY_RUN_UID=0` so the app can write to the volume |

Sources: [Railway outbound networking (SMTP)](https://docs.railway.com/reference/outbound-networking),
[volumes](https://docs.railway.com/reference/volumes),
[pre-deploy command](https://docs.railway.com/guides/pre-deploy-command),
[variables](https://docs.railway.com/guides/variables),
[MySQL](https://docs.railway.com/guides/mysql),
[Railpack Node.js](https://railpack.com/languages/node),
[Brevo send email API](https://developers.brevo.com/reference/sendtransacemail),
[Brevo authorised IPs](https://help.brevo.com/hc/en-us/articles/5740111683858).
