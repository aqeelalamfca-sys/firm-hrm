# Deployment Guide — ana-ca.com on Hostinger VPS

## Architecture

```
Replit (develop) → GitHub (firm-hrm) → GitHub Actions (CI/CD) → Hostinger VPS (Docker)
```

- **Replit**: Development environment — code, test, iterate
- **GitHub**: Source of truth — code is pushed here automatically
- **GitHub Actions**: CI/CD — auto-deploys to VPS on every push to `main`
- **Hostinger VPS**: Production — Docker containers serve the live app

## VPS Info

- **IP**: 187.77.130.117
- **OS**: Ubuntu 22.04 LTS
- **Containers**: `ana-backend` (port 5002:5000), `ana-db` (port 5433:5432)
- **Domain**: ana-ca.com

---

## Quick Setup (First Time)

### Option A: Automated Setup

SSH into your VPS and run the setup script:

```bash
ssh root@187.77.130.117
curl -sSL https://raw.githubusercontent.com/aqeelalamfca-sys/firm-hrm/main/deploy/vps-setup.sh | bash
```

Or clone first, then run:

```bash
git clone https://github.com/aqeelalamfca-sys/firm-hrm.git ~/firm-hrm
cd ~/firm-hrm
bash deploy/vps-setup.sh
```

### Option B: Manual Setup

Follow the steps below.

---

## Step 1: DNS Setup

Point your domain to the VPS IP. Add these DNS records:

```
A Record:  ana-ca.com      →  187.77.130.117
A Record:  www.ana-ca.com  →  187.77.130.117
```

## Step 2: GitHub Secrets

Go to: https://github.com/aqeelalamfca-sys/firm-hrm/settings/secrets/actions

Add these secrets:

| Secret Name    | Value                              |
|---------------|-------------------------------------|
| VPS_HOST       | 187.77.130.117                     |
| VPS_USERNAME   | root                               |
| VPS_SSH_KEY    | (VPS private SSH key - see below)  |
| VPS_PORT       | 22                                 |

### Generate SSH Key on VPS

```bash
ssh root@187.77.130.117
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-actions"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy   # Copy this as VPS_SSH_KEY secret
```

## Step 3: Clone & Configure on VPS

```bash
ssh root@187.77.130.117
git clone https://github.com/aqeelalamfca-sys/firm-hrm.git ~/firm-hrm
cd ~/firm-hrm/deploy
cp .env.example .env
nano .env
```

Set strong values:
```
DB_PASSWORD=your_strong_password
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
```

## Step 4: Build & Start Containers

```bash
cd ~/firm-hrm/deploy
docker compose --env-file .env up -d --build
```

This starts:
- `ana-db` — PostgreSQL 16 on port 5433 (external), 5432 (internal)
- `ana-backend` — Node.js app on port 5002 (external), 5000 (internal)

Verify:
```bash
docker ps --filter "name=ana-"
curl http://localhost:5002/api/health
```

## Step 5: Configure Nginx

### If Nginx runs on the host:
```bash
cp ~/firm-hrm/deploy/nginx-ana-ca.conf /etc/nginx/sites-available/ana-ca.com
ln -sf /etc/nginx/sites-available/ana-ca.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### If Nginx runs in a Docker container:
```bash
docker cp ~/firm-hrm/deploy/nginx-ana-ca.conf YOUR_NGINX_CONTAINER:/etc/nginx/conf.d/ana-ca.conf
docker exec YOUR_NGINX_CONTAINER nginx -t
docker exec YOUR_NGINX_CONTAINER nginx -s reload
```

## Step 6: SSL Certificate

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d ana-ca.com -d www.ana-ca.com --non-interactive --agree-tos -m admin@ana-ca.com
```

## Step 7: Verify

```bash
curl -I https://ana-ca.com
curl https://ana-ca.com/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

---

## CI/CD: Automatic Deployment

After setup, every push to `main` on GitHub triggers automatic deployment via GitHub Actions.

### How it works:
1. You develop in Replit
2. Code is pushed to GitHub (`firm-hrm` repo)
3. GitHub Actions runs `.github/workflows/deploy.yml`
4. The workflow SSHes into your VPS
5. Pulls latest code, rebuilds Docker containers
6. Verifies the backend is healthy

### Manual trigger:
Go to GitHub → Actions → "Deploy to Hostinger VPS" → "Run workflow"

---

## Ports Used

| Service      | Internal | External | Notes                    |
|-------------|----------|----------|--------------------------|
| ana-db      | 5432     | 5433     | PostgreSQL               |
| ana-backend | 5000     | 5002     | Node.js API + Frontend   |

## Updating the App

### Automatic (recommended):
Push to `main` on GitHub — deployment happens automatically.

### Manual:
```bash
cd ~/firm-hrm
git pull origin main
cd deploy
docker compose --env-file .env up -d --build
```

## Troubleshooting

View logs:
```bash
docker logs ana-backend -f
docker logs ana-db -f
```

Restart:
```bash
cd ~/firm-hrm/deploy
docker compose restart
```

Full rebuild:
```bash
cd ~/firm-hrm/deploy
docker compose --env-file .env down
docker compose --env-file .env up -d --build
```

Check GitHub Actions logs:
https://github.com/aqeelalamfca-sys/firm-hrm/actions
