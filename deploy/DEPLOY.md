# Deployment Guide — ana-ca.com on Hostinger VPS

## Architecture

```
Replit (develop)
    ↓  bash scripts/deploy.sh
GitHub (aqeelalamfca-sys/firm-hrm) — central source of truth
    ↓  SSH pull on VPS
Hostinger VPS 187.77.130.117 (Docker) — live production
    ↓  Nginx reverse proxy
https://ana-ca.com
```

---

## VPS Info

| Item         | Value                                  |
|-------------|----------------------------------------|
| IP           | 187.77.130.117                        |
| OS           | Ubuntu 22.04 LTS (KVM)               |
| Backend      | `ana-backend` container (port 5002)   |
| Database     | `ana-db` PostgreSQL 16 (port 5433)   |
| Domain       | ana-ca.com / www.ana-ca.com           |
| Nginx        | Host-level, HTTPS via Let's Encrypt   |

---

## One-Command Workflows (from Replit shell)

```bash
# Full deploy: push to GitHub + deploy to VPS
bash scripts/deploy.sh

# Push to GitHub only (no VPS deploy)
bash scripts/push.sh

# Check VPS container & service status
bash scripts/vps-status.sh

# Stream live backend logs
bash scripts/vps-logs.sh

# View specific logs
bash scripts/vps-logs.sh backend      # backend app logs (default)
bash scripts/vps-logs.sh db           # database logs
bash scripts/vps-logs.sh build        # last deploy build log
bash scripts/vps-logs.sh nginx        # nginx access log
bash scripts/vps-logs.sh nginx-error  # nginx error log

# Rollback to previous commit
bash scripts/vps-rollback.sh

# Rollback to specific commit
bash scripts/vps-rollback.sh abc1234

# Force full rebuild (no code pull)
bash scripts/vps-rebuild.sh

# Open interactive SSH shell on VPS
bash scripts/vps-shell.sh
```

---

## First-Time VPS Setup

Run this ONCE on the VPS (via Hostinger Terminal):

```bash
ssh root@187.77.130.117
git clone https://github.com/aqeelalamfca-sys/firm-hrm.git ~/firm-hrm
bash ~/firm-hrm/deploy/vps-setup.sh
```

The setup script:
1. Updates system packages
2. Installs Docker, Nginx, Certbot
3. Configures UFW firewall (ports 22, 80, 443)
4. Generates an SSH keypair for Replit access
5. Clones the repository
6. Creates a secure production `.env`
7. Builds and starts Docker containers
8. Configures Nginx for ana-ca.com
9. Issues Let's Encrypt SSL certificate
10. Sets up SSL auto-renewal cron job

---

## Required Secrets (Replit Secrets panel)

| Secret          | Description                                        |
|----------------|----------------------------------------------------|
| `GITHUB_TOKEN`  | GitHub Personal Access Token (repo scope)         |
| `VPS_SSH_KEY`   | VPS SSH private key (`~/.ssh/id_ed25519` content) |
| `DB_PASSWORD`   | PostgreSQL database password                       |
| `ENCRYPTION_KEY`| App encryption key (32 hex chars)                 |

These are automatically available as environment variables in all scripts.

---

## DNS Setup

Point your domain A records to the VPS:

```
A Record:    ana-ca.com      →  187.77.130.117
A Record:    www.ana-ca.com  →  187.77.130.117
```

DNS propagation can take up to 48 hours. Check with:
```bash
nslookup ana-ca.com
dig ana-ca.com
```

---

## Docker Services

```yaml
ana-db:       PostgreSQL 16   — internal port 5432, host port 127.0.0.1:5433
ana-backend:  Node.js app     — internal port 5000, host port 127.0.0.1:5002
```

Both ports are bound to `127.0.0.1` only — traffic goes through Nginx.

---

## Manual VPS Commands

```bash
# SSH into VPS
bash scripts/vps-shell.sh

# On the VPS:
cd ~/firm-hrm/deploy

# Check status
docker ps --filter "name=ana-"
docker stats --no-stream

# View logs
docker logs ana-backend -f --tail=100
docker logs ana-db --tail=50

# Restart backend only
docker compose --env-file .env restart ana-backend

# Full restart
docker compose --env-file .env down
docker compose --env-file .env up -d

# Full rebuild
docker compose --env-file .env down
docker compose --env-file .env up -d --build --no-cache

# Database shell
docker exec -it ana-db psql -U ana_user -d ana_hrm

# Enter backend container
docker exec -it ana-backend sh

# Manual SSL renewal
certbot renew --dry-run
certbot renew && systemctl reload nginx
```

---

## Nginx Configuration

The Nginx config is at `deploy/nginx-ana-ca.conf` and is installed to:
`/etc/nginx/sites-available/ana-ca.com`

After certbot runs, the config is updated automatically with HTTPS redirect and SSL blocks.

Reload nginx after config changes:
```bash
nginx -t && systemctl reload nginx
```

---

## Troubleshooting

**Backend not starting:**
```bash
bash scripts/vps-logs.sh backend
# or
bash scripts/vps-logs.sh build
```

**SSL not working:**
```bash
certbot certificates
certbot --nginx -d ana-ca.com -d www.ana-ca.com
```

**Database issues:**
```bash
bash scripts/vps-logs.sh db
docker exec -it ana-db pg_isready -U ana_user -d ana_hrm
```

**Port blocked:**
```bash
ufw status
ufw allow 80/tcp && ufw allow 443/tcp
```

**Full reset (data preserved):**
```bash
cd ~/firm-hrm/deploy
docker compose --env-file .env down
docker compose --env-file .env up -d --build --no-cache
```

**Full reset including database (⚠️ data loss):**
```bash
cd ~/firm-hrm/deploy
docker compose --env-file .env down -v   # removes volumes
docker compose --env-file .env up -d --build
```
