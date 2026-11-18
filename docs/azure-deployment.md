# Deploying CampusBazaar on Azure for Students

This guide puts CampusBazaar on **Azure for Students** (no credit card; $100 credit) using two
services from the free list, plus **Brevo** for verification emails:

| Part | Azure service | Free allowance (check the portal's "Free services" page) |
|---|---|---|
| Web server (Node.js, Caddy for HTTPS, photos on disk) | Linux virtual machine, size **B1s** | 750 hours/month |
| Database (MySQL 8, automatic backups) | Azure Database for MySQL – Flexible Server, **Burstable B1ms** | 750 hours/month, 32 GB storage |

Anything outside the free list (for example the public IP address) is paid from the $100 credit. Set a
budget alert in step 1 so nothing surprises you.

Read [deployment.md](deployment.md) first; it explains what the app needs and the launch checklist.
Replace the placeholders in `<angle brackets>` with your own names. **Choose your own passwords and type
them yourself; never commit them.**

---

## 1. Activate Azure for Students

1. Go to <https://azure.microsoft.com/en-us/free/students/> and sign up with your `@uohyd.ac.in` address.
2. In the portal, open **Cost Management → Budgets** and create a monthly budget of $5 with an email alert.
3. Create a **resource group** called `campusbazaar-rg`. Pick a region close to Hyderabad (for example
   *Central India* or *South India*). Student subscriptions only allow some regions. If the portal refuses
   a region, try another and use the same one for everything below.

## 2. Create the virtual machine

**Create a resource → Virtual machine:**

| Setting | Value |
|---|---|
| Resource group / region | `campusbazaar-rg` / the region from step 1 |
| Image | **Ubuntu Server 24.04 LTS** |
| Size | **B1s** (marked "Free services eligible") |
| Authentication | **SSH public key** (let Azure generate one and download the `.pem` file, keep it safe) |
| Username | e.g. `azureuser` |
| Inbound ports | **SSH (22), HTTP (80), HTTPS (443)** |
| OS disk | Use the free-eligible SSD size the portal suggests |

After it is created:

1. Open the VM's **public IP address** resource → **Configuration** → set a **DNS name label**, e.g.
   `campusbazaar-uoh`. Your site address becomes
   `https://campusbazaar-uoh.<region>.cloudapp.azure.com`. Write it down; it is `<site-host>` below.
2. Make the IP address **Static** on the same page, so the database firewall rule keeps working.
3. Open **Networking** on the VM and change the SSH rule's source to **My IP address**, so only you can
   log in.

## 3. Create the MySQL database server

**Create a resource → Azure Database for MySQL → Flexible server:**

| Setting | Value |
|---|---|
| Resource group / region | `campusbazaar-rg` / same region as the VM |
| MySQL version | **8.0** |
| Workload type | **For development or hobby projects** |
| Compute + storage | **Burstable, B1ms**, storage **20 GB**, High availability **off**, geo-redundant backup **off** |
| Authentication | MySQL authentication only; admin username e.g. `cbadmin`, a strong password you choose |
| Networking | **Public access**; add a firewall rule allowing the **VM's public IP** only |

The server's host name looks like `<db-server>.mysql.database.azure.com`. Azure requires encrypted
connections, so the app needs `DB_SSL=true` (step 6).

## 4. Prepare the VM

Connect from your computer (PowerShell works):

```bash
ssh -i path/to/your-key.pem azureuser@<site-host>
```

Then run these on the VM, one at a time.

Add 2 GB of swap (B1s has 1 GB of memory, which is too little to build the website):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Install Node.js 22 LTS (NodeSource), Git and the MySQL client:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```
```bash
sudo apt-get install -y nodejs git mysql-client
```

Create a separate user that runs the app, and the photos folder:

```bash
sudo useradd --system --create-home --home-dir /opt/campusbazaar --shell /usr/sbin/nologin campusbazaar
```
```bash
sudo mkdir -p /var/lib/campusbazaar/uploads && sudo chown -R campusbazaar:campusbazaar /var/lib/campusbazaar
```

The app's files belong to that user, so open a shell as it for every app step (the prompt changes; type
`exit` to return to `azureuser`):

```bash
sudo -u campusbazaar -H bash
```

Get the code. If the GitHub repository is **public**:

```bash
git clone https://github.com/<your-github-user>/<repo>.git /opt/campusbazaar/app
```

If it is **private**, create a read-only *deploy key* for this user (`ssh-keygen -t ed25519`, then add
`~/.ssh/id_ed25519.pub` under GitHub → repository → Settings → Deploy keys) and clone with the
`git@github.com:` address instead. Type `exit` when done.

## 5. Create the database and its app user

Connect to the database server as the admin. The `--ssl-ca` flag makes the client verify Azure's
certificate using Ubuntu's trusted list:

```bash
mysql -h <db-server>.mysql.database.azure.com -u cbadmin -p --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/ssl/certs/ca-certificates.crt
```

Then, at the `mysql>` prompt (choose a new password for the app user):

```sql
CREATE DATABASE campusbazaar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'campusbazaar_app'@'%' IDENTIFIED BY '<app-db-password>';
GRANT ALL PRIVILEGES ON campusbazaar.* TO 'campusbazaar_app'@'%';
EXIT;
```

`'%'` is needed because the connection comes from the VM, not from the database server itself. The
firewall rule from step 3 still limits who can reach it.

## 6. Set up email (Brevo)

1. Create a free account at <https://www.brevo.com/> and complete its account check.
2. **Senders, Domains & Dedicated IPs → Senders:** add and verify the address emails will come from.
3. **SMTP & API → SMTP:** note the SMTP server (`smtp-relay.brevo.com`), port `587`, your **SMTP login**
   (not your account email) and create an **SMTP key** (this is the password).

Before you rely on Brevo, ask the university IT department whether they offer an SMTP relay for
`uohyd.ac.in`. If they do, use their settings instead. Emails from the university's own domain are less
likely to land in spam.

## 7. Configure the app

Open a shell as the app user and create the settings file. Only the app user can read it, and Git
ignores it:

```bash
sudo -u campusbazaar -H bash
```
```bash
cd /opt/campusbazaar/app && nano server/.env
```

```ini
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://<site-host>
TRUST_PROXY=1

DB_HOST=<db-server>.mysql.database.azure.com
DB_PORT=3306
DB_USER=campusbazaar_app
DB_PASSWORD=<app-db-password>
DB_NAME=campusbazaar
DB_SSL=true

# Generate a NEW one on the VM: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=<new-random-secret>
ALLOWED_EMAIL_DOMAINS=uohyd.ac.in
UPLOAD_DIR=/var/lib/campusbazaar/uploads

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<brevo-smtp-login>
SMTP_PASS=<brevo-smtp-key>
EMAIL_FROM=CampusBazaar <your-verified-sender@example.com>
```

```bash
chmod 600 server/.env
```

`DB_SSL=true` encrypts the database connection and checks Azure's certificate against Node's built-in
trusted authorities. If the app later reports a certificate error, download the CA certificates listed in
Microsoft's *"Connect using TLS/SSL"* guide for Flexible Server and set `DB_SSL_CA=/path/to/file.pem`.
Always use the server's host name in `DB_HOST`, not an IP address.

## 8. Build and create the tables

Still in the app user's shell, in `/opt/campusbazaar/app`:

```bash
npm ci --prefix server --omit=dev
```
```bash
npm ci --prefix client
```
```bash
npm run build --prefix client
```
```bash
npm run db:setup --prefix server
```

Then type `exit` to return to `azureuser`.

## 9. Run the app as a service

```bash
sudo nano /etc/systemd/system/campusbazaar.service
```

```ini
[Unit]
Description=CampusBazaar
After=network-online.target
Wants=network-online.target

[Service]
User=campusbazaar
WorkingDirectory=/opt/campusbazaar/app/server
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/campusbazaar

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now campusbazaar
```
```bash
curl http://127.0.0.1:4000/api/health
```

The last command should print `{"status":"ok"}`. If it doesn't, read the log with
`sudo journalctl -u campusbazaar -n 50`.

Port 4000 is not open to the internet (only 22, 80 and 443 are). Visitors reach the app through Caddy.

## 10. HTTPS with Caddy

Install Caddy from its official package repository (commands from <https://caddyserver.com/docs/install>):

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
```
```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```
```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```
```bash
sudo apt-get update && sudo apt-get install -y caddy
```

Replace the contents of `/etc/caddy/Caddyfile` with:

```
<site-host> {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4000
}
```

```bash
sudo systemctl reload caddy
```

Caddy gets a free Let's Encrypt certificate automatically and passes WebSocket (live update)
connections through. Open `https://<site-host>/api/health` in your browser.

## 11. Finish and test

1. Register with your real `@uohyd.ac.in` address and confirm the verification email arrives (check spam).
2. Make yourself administrator:
   ```bash
   sudo -u campusbazaar -H bash -c 'cd /opt/campusbazaar/app && npm run make-admin --prefix server -- you@uohyd.ac.in'
   ```
3. Work through the **Launch checklist** in [deployment.md](deployment.md). The important checks: a photo
   still loads after `sudo systemctl restart campusbazaar`, and a bid from a second account appears live.

## Updating after new commits

```bash
sudo -u campusbazaar -H bash -c 'cd /opt/campusbazaar/app && git pull && npm ci --prefix server --omit=dev && npm ci --prefix client && npm run build --prefix client && npm run db:setup --prefix server'
```
```bash
sudo systemctl restart campusbazaar
```

## Backups and costs

- **Database:** Flexible Server keeps automatic backups (7 days by default; restore from the portal).
- **Photos:** stored on the VM's disk in `/var/lib/campusbazaar/uploads`. Copy them to your computer now
  and then, e.g.
  `scp -i your-key.pem -r azureuser@<site-host>:/var/lib/campusbazaar/uploads ./campusbazaar-photos`.
- **Costs:** check **Cost Management** weekly at first. The free allowances last 12 months. Renew Azure for
  Students each year while you are enrolled.
