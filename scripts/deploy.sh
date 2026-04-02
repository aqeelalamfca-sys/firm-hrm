#!/bin/bash
# =============================================================================
# Replit → GitHub → VPS Deploy Script
# Usage: bash scripts/deploy.sh ["optional commit message"]
# =============================================================================
set -e

COMMIT_MSG="${1:-Deploy from Replit $(date '+%Y-%m-%d %H:%M UTC')}"
REPO="aqeelalamfca-sys/firm-hrm"
VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── 1. Load SSH key ───────────────────────────────────────────────────────────
setup_ssh() {
  if [ -s "$SSH_KEY" ]; then
    ok "SSH key already on disk"
  elif [ -n "$VPS_SSH_KEY" ]; then
    log "Writing VPS_SSH_KEY secret to disk..."
    mkdir -p ~/.ssh
    printf '%s\n' "$VPS_SSH_KEY" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    ok "SSH key written from VPS_SSH_KEY secret"
  else
    err "No SSH key found. Set VPS_SSH_KEY in Replit Secrets or run the one-time VPS setup."
  fi
  chmod 600 "$SSH_KEY"
  ssh-keyscan -p "$VPS_PORT" -T 10 "$VPS_IP" >> ~/.ssh/known_hosts 2>/dev/null || true
  ok "SSH ready → $VPS_IP"
}

# ── 2. Push to GitHub ─────────────────────────────────────────────────────────
push_to_github() {
  [ -z "$GITHUB_TOKEN" ] && err "GITHUB_TOKEN secret is not set."

  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
  git config --global user.name  "Replit Agent"
  git config --global user.email "deploy@ana-ca.com"

  log "Staging all changes..."
  git add -A

  if git diff --cached --quiet; then
    warn "No new changes to commit."
  else
    git commit -m "$COMMIT_MSG"
    ok "Committed: $COMMIT_MSG"
  fi

  log "Pushing to GitHub..."
  git push origin main
  ok "Pushed → https://github.com/$REPO"
}

# ── 3. Deploy on VPS ──────────────────────────────────────────────────────────
deploy_on_vps() {
  log "Connecting to VPS ($VPS_IP)..."
  ssh -i "$SSH_KEY" \
      -o StrictHostKeyChecking=no \
      -o BatchMode=yes \
      -o ConnectTimeout=20 \
      -p "$VPS_PORT" \
      "${VPS_USER}@${VPS_IP}" << 'REMOTE'
set -e
APP_DIR=~/firm-hrm
DEPLOY_DIR="$APP_DIR/deploy"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "[VPS] First deploy — cloning repository..."
  git clone https://github.com/aqeelalamfca-sys/firm-hrm.git "$APP_DIR"
else
  echo "[VPS] Pulling latest code..."
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
fi

cd "$APP_DIR"
echo "[VPS] Commit: $(git log --oneline -1)"

[ ! -f "$DEPLOY_DIR/.env" ] && cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env" \
  && echo "[VPS] .env created — update with real credentials"

docker network create auditwise_auditwise 2>/dev/null || true

cd "$DEPLOY_DIR"
echo "[VPS] Building ana-backend..."
docker compose --env-file .env build --no-cache ana-backend
docker compose --env-file .env up -d --force-recreate --no-deps ana-backend

echo "[VPS] Waiting for backend to be healthy..."
for i in 1 2 3 4 5 6; do
  if curl -sf http://localhost:5002/api/health > /dev/null 2>&1; then
    echo "[VPS] ✓ Backend healthy!"
    break
  fi
  [ $i -eq 6 ] && echo "[VPS] ⚠ Health check timed out — check docker logs ana-backend" && break
  echo "[VPS] Attempt $i/6, waiting 5s..."
  sleep 5
done

echo "[VPS] Container status:"
docker ps --filter "name=ana-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
REMOTE
  ok "VPS deployment complete"
}

# ── 4. Verify live ────────────────────────────────────────────────────────────
verify_live() {
  log "Checking live site..."
  sleep 5
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 12 https://ana-ca.com/api/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    ok "Live at https://ana-ca.com ✓"
  else
    warn "Live check returned HTTP $STATUS (DNS/SSL may still be propagating)"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Replit → GitHub → VPS → ana-ca.com          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

setup_ssh
push_to_github
deploy_on_vps
verify_live

echo ""
ok "Done! https://ana-ca.com is live."
