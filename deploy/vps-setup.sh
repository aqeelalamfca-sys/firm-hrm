#!/bin/bash
# =============================================================================
# First-time VPS Setup for ana-ca.com on Hostinger Ubuntu 22.04 LTS
# Run ONCE as root on the VPS: bash vps-setup.sh
# After setup, all future deploys use: bash scripts/deploy.sh (from Replit)
# =============================================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

[ "$(id -u)" -ne 0 ] && err "Run this script as root: sudo bash vps-setup.sh"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   First-Time VPS Setup for ana-ca.com            ║"
echo "║   Hostinger KVM Ubuntu 22.04 LTS                 ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. System updates ─────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git ufw fail2ban unzip openssl
ok "System packages updated"

# ── 2. UFW Firewall ───────────────────────────────────────────────────────────
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"
ufw --force enable
ok "Firewall configured (22, 80, 443 open)"

# ── 3. Docker ─────────────────────────────────────────────────────────────────
log "Installing Docker..."
if command -v docker &>/dev/null; then
  ok "Docker already installed: $(docker --version)"
else
  apt-get install -y -qq ca-certificates gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  ok "Docker installed: $(docker --version)"
fi

# ── 4. Nginx ──────────────────────────────────────────────────────────────────
log "Installing Nginx..."
if command -v nginx &>/dev/null; then
  ok "Nginx already installed"
else
  apt-get install -y -qq nginx
  systemctl enable nginx
  systemctl start nginx
  ok "Nginx installed"
fi

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# ── 5. Certbot ────────────────────────────────────────────────────────────────
log "Installing Certbot..."
if command -v certbot &>/dev/null; then
  ok "Certbot already installed"
else
  apt-get install -y -qq certbot python3-certbot-nginx
  ok "Certbot installed"
fi

# ── 6. SSH Key for Replit → VPS access ───────────────────────────────────────
log "Setting up SSH key for Replit deploy access..."
mkdir -p ~/.ssh && chmod 700 ~/.ssh

if [ ! -f ~/.ssh/id_ed25519 ]; then
  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "replit-deploy@ana-ca.com"
  cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Add this PRIVATE KEY to Replit Secrets as VPS_SSH_KEY:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat ~/.ssh/id_ed25519
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  ok "SSH keypair created"
else
  ok "SSH key already exists at ~/.ssh/id_ed25519"
  echo ""
  echo "Existing private key (VPS_SSH_KEY for Replit):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat ~/.ssh/id_ed25519
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
fi

# ── 7. Clone repository ───────────────────────────────────────────────────────
APP_DIR=~/firm-hrm
DEPLOY_DIR="$APP_DIR/deploy"

log "Setting up application directory..."
if [ ! -d "$APP_DIR/.git" ]; then
  log "Cloning repository..."
  git clone https://github.com/aqeelalamfca-sys/firm-hrm.git "$APP_DIR"
  ok "Repository cloned"
else
  log "Updating existing repository..."
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
  ok "Repository updated to: $(git log --oneline -1)"
fi

# ── 8. Create .env on VPS ─────────────────────────────────────────────────────
log "Setting up production .env..."
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  if [ -f "$DEPLOY_DIR/.env.example" ]; then
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  else
    touch "$DEPLOY_DIR/.env"
  fi

  # Generate secure random values if not already set
  DB_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 28)
  JWT_SEC=$(openssl rand -hex 32)
  ENC_KEY=$(openssl rand -hex 32)

  cat > "$DEPLOY_DIR/.env" << ENVEOF
DB_PASSWORD=${DB_PASS}
JWT_SECRET=${JWT_SEC}
ENCRYPTION_KEY=${ENC_KEY}
ENVEOF

  chmod 600 "$DEPLOY_DIR/.env"
  echo ""
  warn "Generated new secrets in $DEPLOY_DIR/.env — SAVE THESE:"
  cat "$DEPLOY_DIR/.env"
  echo ""
  warn "If you deploy from Replit, those secrets will overwrite this file."
else
  ok ".env already exists at $DEPLOY_DIR/.env"
fi

# ── 9. Set up Nginx ───────────────────────────────────────────────────────────
log "Configuring Nginx for ana-ca.com..."
cp "$APP_DIR/deploy/nginx-ana-ca.conf" /etc/nginx/sites-available/ana-ca.com
ln -sf /etc/nginx/sites-available/ana-ca.com /etc/nginx/sites-enabled/ana-ca.com
nginx -t && systemctl reload nginx
ok "Nginx configured"

# ── 10. Build and start containers ───────────────────────────────────────────
log "Building and starting Docker containers..."
cd "$DEPLOY_DIR"
docker compose --env-file .env up -d --build
ok "Containers started"

# Wait for backend to be healthy
log "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:5002/api/health > /dev/null 2>&1; then
    ok "Backend is healthy"
    break
  fi
  sleep 5
done

# ── 11. SSL Certificate ───────────────────────────────────────────────────────
echo ""
log "Setting up SSL certificate..."
warn "DNS must point ana-ca.com → 187.77.130.117 for SSL to work."
echo ""
if certbot --nginx -d ana-ca.com -d www.ana-ca.com \
    --non-interactive --agree-tos -m admin@ana-ca.com 2>/dev/null; then
  ok "SSL certificate issued for ana-ca.com and www.ana-ca.com"

  # Auto-renewal cron (certbot usually installs this, but ensure it)
  if ! crontab -l 2>/dev/null | grep -q certbot; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
    ok "SSL auto-renewal cron job added (runs daily at 3am)"
  fi
else
  warn "SSL setup failed — ensure DNS A record is pointing to this server."
  warn "After DNS propagates, run: certbot --nginx -d ana-ca.com -d www.ana-ca.com"
fi

# ── 12. Final Status ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "VPS SETUP COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
docker ps --filter "name=ana-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Next steps:"
echo "  1. Ensure VPS_SSH_KEY (above) is in Replit Secrets"
echo "  2. From Replit: bash scripts/deploy.sh"
echo "  3. Monitor:     bash scripts/vps-status.sh"
echo ""
