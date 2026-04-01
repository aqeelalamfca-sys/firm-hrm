#!/bin/bash
# =============================================================================
# Replit → GitHub → VPS Deploy Script
# Usage: bash scripts/deploy.sh [commit message]
# =============================================================================
set -e

COMMIT_MSG="${1:-Deploy from Replit $(date '+%Y-%m-%d %H:%M')}"
REPO="aqeelalamfca-sys/firm-hrm"
VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── 1. Setup SSH key ──────────────────────────────────────────────────────────
setup_ssh() {
    if [ -z "$VPS_SSH_KEY" ]; then
        err "VPS_SSH_KEY secret is not set. Add it in Replit Secrets."
    fi
    mkdir -p ~/.ssh
    # Reformat key (spaces → newlines if pasted as single line)
    node -e "
const key = process.env.VPS_SSH_KEY;
let fixed = key.replace('-----BEGIN OPENSSH PRIVATE KEY----- ', '-----BEGIN OPENSSH PRIVATE KEY-----\n');
fixed = fixed.replace(' -----END OPENSSH PRIVATE KEY-----', '\n-----END OPENSSH PRIVATE KEY-----');
const lines = fixed.split('\n');
const result = [];
for (const line of lines) {
    if (line.startsWith('-----')) { result.push(line); }
    else {
        const body = line.replace(/ /g, '');
        for (let i = 0; i < body.length; i += 64) result.push(body.slice(i, i+64));
    }
}
process.stdout.write(result.join('\n') + '\n');
" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    ssh-keyscan -p "$VPS_PORT" -T 10 "$VPS_IP" >> ~/.ssh/known_hosts 2>/dev/null
    ok "SSH key ready"
}

# ── 2. Push to GitHub ─────────────────────────────────────────────────────────
push_to_github() {
    if [ -z "$GITHUB_TOKEN" ]; then
        err "GITHUB_TOKEN secret is not set. Add it in Replit Secrets."
    fi

    git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
    git config --global user.name  "Replit Agent"
    git config --global user.email "replit@ana-ca.com"

    log "Staging all changes..."
    git add -A

    if git diff --cached --quiet; then
        warn "No changes to commit — skipping commit step."
    else
        git commit -m "$COMMIT_MSG"
        ok "Committed: $COMMIT_MSG"
    fi

    log "Pushing to GitHub (main)..."
    git push origin main
    ok "Pushed to https://github.com/$REPO"
}

# ── 3. Deploy on VPS ──────────────────────────────────────────────────────────
deploy_on_vps() {
    log "Connecting to VPS ($VPS_IP)..."
    ssh -i "$SSH_KEY" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout=15 \
        -o BatchMode=yes \
        -p "$VPS_PORT" \
        "${VPS_USER}@${VPS_IP}" << 'REMOTE'
set -e
APP_DIR=~/firm-hrm
DEPLOY_DIR="$APP_DIR/deploy"

echo "[VPS] Pulling latest code..."
cd "$APP_DIR"
git fetch origin main
git reset --hard origin/main

echo "[VPS] Rebuilding ana-backend container..."
cd "$DEPLOY_DIR"
docker compose --env-file .env build --no-cache ana-backend
docker compose --env-file .env up -d --force-recreate ana-backend

echo "[VPS] Waiting for backend to be healthy..."
for i in 1 2 3 4 5 6; do
    if curl -sf http://localhost:5002/api/health > /dev/null 2>&1; then
        echo "[VPS] ✓ Backend healthy!"
        break
    fi
    echo "[VPS] Attempt $i — waiting 5s..."
    sleep 5
done

echo "[VPS] Container status:"
docker ps --filter "name=ana-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
REMOTE
    ok "VPS deployment complete"
}

# ── 4. Verify live ────────────────────────────────────────────────────────────
verify_live() {
    log "Verifying live site..."
    sleep 3
    if curl -sf --max-time 10 https://ana-ca.com/api/health > /dev/null 2>&1; then
        ok "Live at https://ana-ca.com — health check passed!"
    else
        warn "Health check on https://ana-ca.com/api/health did not respond — check VPS logs."
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo "  Replit → GitHub → VPS Deploy"
echo "  Repo : $REPO"
echo "  VPS  : $VPS_IP"
echo "================================================================"
echo ""

setup_ssh
push_to_github
deploy_on_vps
verify_live

echo ""
echo "================================================================"
echo "  Deploy finished at $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
echo ""
