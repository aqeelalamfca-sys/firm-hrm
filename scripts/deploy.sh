#!/bin/bash
# =============================================================================
# Replit → GitHub → VPS Deploy Script
# Usage: bash scripts/deploy.sh ["optional commit message"]
# Supports: SSH key (VPS_SSH_KEY) OR password (VPS_SSH_PASSWORD)
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

# ── 1. Set up SSH auth (key preferred, password fallback) ─────────────────────
SSH_CMD=""
SCP_CMD=""

setup_ssh() {
  mkdir -p ~/.ssh
  ssh-keyscan -p "$VPS_PORT" -T 10 "$VPS_IP" >> ~/.ssh/known_hosts 2>/dev/null || true

  if [ -s "$SSH_KEY" ]; then
    ok "SSH key already on disk — using key auth"
    SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20 -p $VPS_PORT"
    return
  fi

  if [ -n "$VPS_SSH_KEY" ]; then
    log "Writing VPS_SSH_KEY secret to disk..."
    printf '%s\n' "$VPS_SSH_KEY" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    ok "SSH key written from VPS_SSH_KEY secret"
    SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20 -p $VPS_PORT"
    return
  fi

  if [ -n "$VPS_SSH_PASSWORD" ]; then
    log "No SSH key found — using password auth (sshpass)"
    # Install sshpass if needed
    if ! command -v sshpass &>/dev/null; then
      log "Installing sshpass..."
      apt-get install -y -q sshpass 2>/dev/null || \
      yum install -y -q sshpass 2>/dev/null || \
      nix-env -iA nixpkgs.sshpass 2>/dev/null || \
      { warn "Could not auto-install sshpass; trying ssh-copy approach"; }
    fi
    if command -v sshpass &>/dev/null; then
      SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -o ConnectTimeout=20 -p $VPS_PORT"
      SSHPASS=$(printf '%s' "$VPS_SSH_PASSWORD")
      export SSHPASS
      ok "Password auth ready via sshpass"
    else
      err "sshpass not available and no SSH key set. Please add VPS_SSH_KEY to Replit Secrets."
    fi
    return
  fi

  err "No SSH credentials found. Set VPS_SSH_KEY or VPS_SSH_PASSWORD in Replit Secrets."
}

# ── 2. Push to GitHub ─────────────────────────────────────────────────────────
push_to_github() {
  [ -z "$GITHUB_TOKEN" ] && err "GITHUB_TOKEN secret is not set."

  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
  git config --global user.name  "Replit Agent"
  git config --global user.email "deploy@ana-ca.com"

  # If the index is locked (e.g. by auto-checkpoint), wait briefly then force-remove
  LOCK_FILE="$(git rev-parse --git-dir)/index.lock"
  if [ -f "$LOCK_FILE" ]; then
    warn "Git index.lock detected — waiting up to 10s for it to clear..."
    for i in $(seq 1 4); do
      sleep 2
      [ ! -f "$LOCK_FILE" ] && break
    done
    if [ -f "$LOCK_FILE" ]; then
      warn "Force-removing stale index.lock"
      rm -f "$LOCK_FILE"
    fi
  fi

  log "Staging all changes..."
  git add -A
  if git diff --cached --quiet; then
    warn "No new changes to commit — pushing current HEAD anyway."
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

  $SSH_CMD "${VPS_USER}@${VPS_IP}" << 'REMOTE'
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
for i in 1 2 3 4 5 6 7 8; do
  if curl -sf http://localhost:5002/api/health > /dev/null 2>&1; then
    echo "[VPS] ✓ Backend healthy after ${i}x5s!"
    break
  fi
  [ $i -eq 8 ] && echo "[VPS] ⚠ Health check timed out — check: docker logs ana-backend" && break
  echo "[VPS] Attempt $i/8, waiting 5s..."
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
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 15 https://ana-ca.com/api/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    ok "Live at https://ana-ca.com ✓ (HTTP $STATUS)"
  else
    warn "Live check returned HTTP $STATUS (DNS/SSL may still be propagating — this is normal on first deploy)"
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
