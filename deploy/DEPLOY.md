# Deployment Guide — ana-ca.com on Hostinger VPS

## Prerequisites
- Hostinger VPS with Docker & Docker Compose installed
- Existing auditwise project running (will not be affected)
- Domain ana-ca.com with GoDaddy DNS access

## Step 1: DNS Setup (GoDaddy)

Add these DNS records:
```
A Record:  ana-ca.com      →  YOUR_VPS_IP
A Record:  www.ana-ca.com  →  YOUR_VPS_IP
```

## Step 2: Push Code to GitHub

1. Create a new GitHub repository (e.g., `ana-ca-app`)
2. From Replit, connect via the Version Control tab in the sidebar, or push manually:
```bash
git remote add github https://github.com/YOUR_USERNAME/ana-ca-app.git
git push github main
```

## Step 3: Clone on VPS

```bash
ssh root@YOUR_VPS_IP
cd ~
git clone https://github.com/YOUR_USERNAME/ana-ca-app.git ana-ca-app
cd ana-ca-app
```

## Step 4: Configure Environment

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Set a strong database password:
```
DB_PASSWORD=your_strong_password_here
```

## Step 5: Build & Start Containers

```bash
cd ~/ana-ca-app/deploy
docker compose --env-file .env up -d --build
```

This starts:
- `ana-db` — PostgreSQL 16 on port 5433 (external), 5432 (internal)
- `ana-backend` — Node.js app on port 5001 (external), 5000 (internal)

Verify containers are running:
```bash
docker ps
```

## Step 6: Run Database Migration

```bash
docker exec -it ana-backend sh -c "cd /app && node -e \"
  const { Pool } = require('pg');
  // DB migrations are handled by Drizzle push
\""
```

Or connect directly and run the schema:
```bash
docker exec -it ana-db psql -U ana_user -d ana_hrm
```

## Step 7: Configure Nginx (on the VPS host or in existing nginx container)

### Option A: If nginx runs on the host
```bash
sudo cp ~/ana-ca-app/deploy/nginx-ana-ca.conf /etc/nginx/sites-available/ana-ca.com
sudo ln -s /etc/nginx/sites-available/ana-ca.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option B: If nginx runs in a Docker container (auditwise-nginx)
```bash
docker cp ~/ana-ca-app/deploy/nginx-ana-ca.conf auditwise-nginx:/etc/nginx/conf.d/ana-ca.conf
docker exec auditwise-nginx nginx -t
docker exec auditwise-nginx nginx -s reload
```

**Important:** If using Docker nginx, make sure `ana-backend` is on the same Docker network as `auditwise-nginx`, or use the host IP instead of container name in the proxy_pass.

To connect networks:
```bash
docker network connect auditwise_default ana-backend
```

## Step 8: SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d ana-ca.com -d www.ana-ca.com --non-interactive --agree-tos -m admin@ana-ca.com
```

## Step 9: Verify

```bash
curl -I https://ana-ca.com
curl https://ana-ca.com/api/health
```

You should see `{"status":"ok","timestamp":"..."}` from the health endpoint.

## Ports Used

| Service      | Internal | External | Notes                    |
|-------------|----------|----------|--------------------------|
| ana-db      | 5432     | 5433     | PostgreSQL               |
| ana-backend | 5000     | 5001     | Node.js API + Frontend   |

No conflicts with existing auditwise project (ports 80, 443, 5000, 5432).

## Updating the App

```bash
cd ~/ana-ca-app
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
cd ~/ana-ca-app/deploy
docker compose restart
```

Full rebuild:
```bash
docker compose --env-file .env down
docker compose --env-file .env up -d --build
```
