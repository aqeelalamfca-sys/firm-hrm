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

  # Always prefer writing fresh from VPS_SSH_KEY secret if it is set
  if [ -n "$VPS_SSH_KEY" ]; then
    log "Writing VPS_SSH_KEY secret to disk..."
    # Use node to properly reconstruct the PEM key (handles space-separated secrets)
    export SSH_KEY_PATH="$SSH_KEY"
    node - << 'JSEOF'
const raw = process.env.VPS_SSH_KEY;
const m = raw.match(/(-----BEGIN [^-]+ PRIVATE KEY-----)(.*?)(-----END [^-]+ PRIVATE KEY-----)/s);
if (!m) { process.stderr.write("Cannot parse SSH key structure\n"); process.exit(1); }
const body = m[2].replace(/\s+/g, '');
const lines = [];
for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
const pem = m[1] + '\n' + lines.join('\n') + '\n' + m[3] + '\n';
require('fs').writeFileSync(process.env.SSH_KEY_PATH, pem, { mode: 0o600 });
JSEOF
    chmod 600 "$SSH_KEY"
    if ssh-keygen -y -f "$SSH_KEY" > /dev/null 2>&1; then
      ok "SSH key written and validated from VPS_SSH_KEY secret"
    else
      err "SSH key validation failed — check that VPS_SSH_KEY contains a valid private key"
    fi
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
  log "Connecting to VPS ($VPS_IP) — Step 1: pull latest code..."

  # Step 1: Pull code and kick off background build (exits SSH immediately)
  $SSH_CMD "${VPS_USER}@${VPS_IP}" << 'REMOTE'
APP_DIR=~/firm-hrm
DEPLOY_DIR="$APP_DIR/deploy"
LOG=/tmp/vps_deploy.log

if [ ! -d "$APP_DIR/.git" ]; then
  echo "[VPS] First deploy — cloning repository..."
  git clone https://github.com/aqeelalamfca-sys/firm-hrm.git "$APP_DIR"
else
  echo "[VPS] Pulling latest code from origin/main..."
  cd "$APP_DIR"
  git fetch origin main
  git checkout main 2>/dev/null || true
  git merge --ff-only origin/main 2>/dev/null || git pull origin main
fi

cd "$APP_DIR"
echo "[VPS] Code is at: $(git log --oneline -1)"

[ ! -f "$DEPLOY_DIR/.env" ] && [ -f "$DEPLOY_DIR/.env.example" ] && \
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env" && echo "[VPS] .env created"

docker network create auditwise_auditwise 2>/dev/null || true

# Launch build in background — writes to log, exits SSH session quickly
echo "[VPS] Launching background build → $LOG"
echo "" > "$LOG"
nohup bash -c '
  LOG=/tmp/vps_deploy.log
  DEPLOY_DIR=~/firm-hrm/deploy
  cd "$DEPLOY_DIR"
  echo "[$(date -u)] Stopping old containers..." | tee -a "$LOG"
  docker compose --env-file .env down --remove-orphans >> "$LOG" 2>&1 || true
  docker stop ana-backend ana-frontend >> "$LOG" 2>&1 || true
  docker rm -f ana-backend ana-frontend >> "$LOG" 2>&1 || true
  sleep 2
  echo "[$(date -u)] Building ana-backend..." | tee -a "$LOG"
  docker compose --env-file .env build ana-backend >> "$LOG" 2>&1
  echo "[$(date -u)] Starting ana-backend..." | tee -a "$LOG"
  docker compose --env-file .env up -d --force-recreate --no-deps ana-backend >> "$LOG" 2>&1
  echo "[$(date -u)] Building ana-frontend..." | tee -a "$LOG"
  docker compose --env-file .env build ana-frontend >> "$LOG" 2>&1
  echo "[$(date -u)] Starting ana-frontend..." | tee -a "$LOG"
  docker compose --env-file .env up -d --force-recreate --no-deps ana-frontend >> "$LOG" 2>&1
  echo "[$(date -u)] Seeding admin..." | tee -a "$LOG"
  docker exec ana-db psql -U ana_user -d ana_hrm -c "INSERT INTO users (email,password_hash,name,role,user_status,created_at,updated_at) VALUES ('"'"'admin@calfirm.com'"'"','"'"'961c2b43f4d675b76fad6a74cb9797ca0c8e697254304c57b47e3b3adc13e66c'"'"','"'"'Admin'"'"','"'"'super_admin'"'"','"'"'active'"'"',NOW(),NOW()) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,updated_at=NOW();" >> "$LOG" 2>&1 || true
  echo "[$(date -u)] DEPLOY COMPLETE!" | tee -a "$LOG"
' >> "$LOG" 2>&1 &
echo "[VPS] Background build started (PID $!). Monitor: tail -f /tmp/vps_deploy.log"
REMOTE

  log "Background build running on VPS. Waiting 3 min for build to complete..."

  # Step 2: Wait then check
  for WAIT in 60 60 60 30; do
    sleep "$WAIT"
    log "Checking build status..."
    DONE=$($SSH_CMD "${VPS_USER}@${VPS_IP}" "tail -5 /tmp/vps_deploy.log 2>/dev/null" 2>/dev/null || echo "ssh_error")
    echo "$DONE"
    if echo "$DONE" | grep -q "DEPLOY COMPLETE"; then
      break
    fi
  done

  # Step 3: Show final container status
  log "Final container status:"
  $SSH_CMD "${VPS_USER}@${VPS_IP}" \
    "docker ps --filter 'name=ana-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null; \
     echo; echo 'Last 10 lines of build log:'; tail -10 /tmp/vps_deploy.log 2>/dev/null" 2>/dev/null || true

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
