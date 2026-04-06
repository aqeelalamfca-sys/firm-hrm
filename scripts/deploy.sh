#!/bin/bash
# =============================================================================
# Replit → GitHub → VPS Deploy Script
# Usage: bash scripts/deploy.sh ["optional commit message"]
# Requires secrets: GITHUB_TOKEN, VPS_SSH_KEY
# Requires env vars: VPS_HOST, VPS_USERNAME, VPS_PORT, DB_PASSWORD,
#                    JWT_SECRET, ENCRYPTION_KEY, GITHUB_REPO
# =============================================================================
set -e

COMMIT_MSG="${1:-Deploy from Replit $(date '+%Y-%m-%d %H:%M UTC')}"
REPO="${GITHUB_REPO:-aqeelalamfca-sys/firm-hrm}"
VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Replit → GitHub → VPS → ana-ca.com          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Validate required secrets ──────────────────────────────────────────────
validate_env() {
  local missing=0
  for var in GITHUB_TOKEN VPS_SSH_KEY DB_PASSWORD JWT_SECRET ENCRYPTION_KEY; do
    if [ -z "${!var}" ]; then
      warn "Missing required: $var"
      missing=1
    fi
  done
  [ "$missing" -eq 1 ] && err "Set missing secrets in Replit Secrets panel, then retry."
  ok "All required secrets present"
}

# ── 2. Set up SSH ─────────────────────────────────────────────────────────────
setup_ssh() {
  mkdir -p ~/.ssh && chmod 700 ~/.ssh

  log "Writing VPS SSH key from secret..."
  export SSH_KEY_PATH="$SSH_KEY"
  node - << 'JSEOF'
const raw = process.env.VPS_SSH_KEY;
if (!raw) { process.stderr.write("VPS_SSH_KEY is empty\n"); process.exit(1); }
const m = raw.match(/(-----BEGIN [^\n-]+ (?:PRIVATE )?KEY-----)([\s\S]*?)(-----END [^\n-]+ (?:PRIVATE )?KEY-----)/);
if (!m) { process.stderr.write("Cannot parse SSH key — paste the full key including BEGIN/END lines\n"); process.exit(1); }
const body = m[2].replace(/\s+/g, '');
const lines = [];
for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
const pem = m[1] + '\n' + lines.join('\n') + '\n' + m[3] + '\n';
require('fs').writeFileSync(process.env.SSH_KEY_PATH, pem, { mode: 0o600 });
JSEOF

  chmod 600 "$SSH_KEY"
  if ! ssh-keygen -y -f "$SSH_KEY" > /dev/null 2>&1; then
    err "SSH key validation failed — verify VPS_SSH_KEY secret contains a valid private key"
  fi
  ok "SSH key validated"

  log "Scanning VPS host fingerprint..."
  ssh-keyscan -p "$VPS_PORT" -T 15 "$VPS_IP" >> ~/.ssh/known_hosts 2>/dev/null || true

  SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20 -p $VPS_PORT"

  log "Testing SSH connection to $VPS_IP..."
  if ! $SSH_CMD "${VPS_USER}@${VPS_IP}" "echo 'SSH OK'" 2>/dev/null | grep -q "SSH OK"; then
    err "SSH failed. Make sure the public key for VPS_SSH_KEY is in /root/.ssh/authorized_keys on the VPS."
  fi
  ok "SSH connection verified"
}

# ── 3. Push to GitHub ─────────────────────────────────────────────────────────
push_to_github() {
  log "Configuring git with GitHub token..."
  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
  git config --global user.name  "Replit Deploy"
  git config --global user.email "deploy@ana-ca.com"

  LOCK_FILE="$(git rev-parse --git-dir)/index.lock"
  if [ -f "$LOCK_FILE" ]; then
    warn "Removing stale git index.lock"
    rm -f "$LOCK_FILE"
  fi

  log "Staging all changes..."
  git add -A

  if git diff --cached --quiet; then
    warn "No new changes to commit — pushing current HEAD."
  else
    git commit -m "$COMMIT_MSG"
    ok "Committed: $COMMIT_MSG"
  fi

  log "Pushing to GitHub (origin/main)..."
  git push origin main
  ok "Pushed → https://github.com/$REPO"
}

# ── 4. Upload .env securely to VPS ────────────────────────────────────────────
upload_env() {
  log "Uploading production .env to VPS (secrets never stored in git)..."
  printf 'DB_PASSWORD=%s\nJWT_SECRET=%s\nENCRYPTION_KEY=%s\n' \
    "$DB_PASSWORD" "$JWT_SECRET" "$ENCRYPTION_KEY" > /tmp/_vps_env

  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -P "$VPS_PORT" \
    /tmp/_vps_env "${VPS_USER}@${VPS_IP}:/root/firm-hrm/deploy/.env.upload" 2>/dev/null || true
  rm -f /tmp/_vps_env

  # Merge upload into .env on VPS (only update keys that are set)
  $SSH_CMD "${VPS_USER}@${VPS_IP}" << 'REMOTE'
UPLOAD=/root/firm-hrm/deploy/.env.upload
TARGET=/root/firm-hrm/deploy/.env
if [ -f "$UPLOAD" ]; then
  cp "$UPLOAD" "$TARGET"
  rm -f "$UPLOAD"
  echo "[VPS] .env updated from Replit secrets"
fi
REMOTE
  ok ".env uploaded to VPS"
}

# ── 5. Deploy on VPS ──────────────────────────────────────────────────────────
deploy_on_vps() {
  log "Connecting to VPS — pulling latest code and starting build..."

  $SSH_CMD "${VPS_USER}@${VPS_IP}" << 'REMOTE'
APP_DIR=~/firm-hrm
DEPLOY_DIR="$APP_DIR/deploy"
LOG=/tmp/vps_deploy.log

echo "[VPS] Starting deployment at $(date -u)"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "[VPS] First deploy — cloning repo..."
  git clone https://github.com/aqeelalamfca-sys/firm-hrm.git "$APP_DIR"
else
  echo "[VPS] Pulling latest from origin/main..."
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
fi
cd "$APP_DIR"
echo "[VPS] HEAD: $(git log --oneline -1)"

echo "" > "$LOG"
nohup bash -c '
  LOG=/tmp/vps_deploy.log
  DEPLOY_DIR=~/firm-hrm/deploy
  cd "$DEPLOY_DIR"

  echo "[$(date -u)] === DEPLOY START ===" | tee -a "$LOG"

  echo "[$(date -u)] Stopping backend gracefully..." | tee -a "$LOG"
  docker compose --env-file .env stop ana-backend >> "$LOG" 2>&1 || true
  docker compose --env-file .env rm -f ana-backend >> "$LOG" 2>&1 || true

  echo "[$(date -u)] Building new image..." | tee -a "$LOG"
  if docker compose --env-file .env build --no-cache ana-backend >> "$LOG" 2>&1; then
    echo "[$(date -u)] Build succeeded" | tee -a "$LOG"
  else
    echo "[$(date -u)] BUILD FAILED" | tee -a "$LOG"
    exit 1
  fi

  echo "[$(date -u)] Starting database..." | tee -a "$LOG"
  docker compose --env-file .env up -d ana-db >> "$LOG" 2>&1

  echo "[$(date -u)] Waiting for database..." | tee -a "$LOG"
  for i in $(seq 1 30); do
    docker exec ana-db pg_isready -U ana_user -d ana_hrm > /dev/null 2>&1 && break || sleep 2
  done
  echo "[$(date -u)] Database ready" | tee -a "$LOG"

  echo "[$(date -u)] Starting backend..." | tee -a "$LOG"
  docker compose --env-file .env up -d --force-recreate --no-deps ana-backend >> "$LOG" 2>&1

  echo "[$(date -u)] Waiting for backend health..." | tee -a "$LOG"
  for i in $(seq 1 24); do
    docker exec ana-backend node -e "fetch('"'"'http://localhost:5000/api/health'"'"').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))" > /dev/null 2>&1 && break || sleep 5
  done

  echo "[$(date -u)] Seeding default admin (idempotent)..." | tee -a "$LOG"
  docker exec ana-db psql -U ana_user -d ana_hrm -c "
    INSERT INTO users (email,password_hash,name,role,user_status,created_at,updated_at)
    VALUES (
      '"'"'admin@calfirm.com'"'"',
      '"'"'961c2b43f4d675b76fad6a74cb9797ca0c8e697254304c57b47e3b3adc13e66c'"'"',
      '"'"'Admin'"'"','"'"'super_admin'"'"','"'"'active'"'"',NOW(),NOW()
    ) ON CONFLICT (email) DO NOTHING;
  " >> "$LOG" 2>&1 || true

  echo "[$(date -u)] Container status:" | tee -a "$LOG"
  docker ps --filter "name=ana-" --format "  {{.Names}}: {{.Status}}" | tee -a "$LOG"

  echo "[$(date -u)] === DEPLOY COMPLETE ===" | tee -a "$LOG"
' >> "$LOG" 2>&1 &
echo "[VPS] Background build started. Monitor: tail -f /tmp/vps_deploy.log"
REMOTE

  ok "VPS build kicked off in background"
  log "Polling for completion (up to 6 min)..."

  local elapsed=0
  while [ $elapsed -lt 360 ]; do
    sleep 30
    elapsed=$((elapsed + 30))
    log "Status check at ${elapsed}s..."
    local status
    status=$($SSH_CMD "${VPS_USER}@${VPS_IP}" "tail -4 /tmp/vps_deploy.log 2>/dev/null" 2>/dev/null || echo "")
    echo "$status"
    if echo "$status" | grep -q "DEPLOY COMPLETE"; then
      ok "Deployment completed successfully!"
      break
    fi
    if echo "$status" | grep -q "BUILD FAILED"; then
      err "Build failed on VPS. Run: bash scripts/vps-logs.sh to see details."
    fi
  done

  log "Final container status:"
  $SSH_CMD "${VPS_USER}@${VPS_IP}" \
    "docker ps --filter 'name=ana-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'; echo; echo 'Last build log lines:'; tail -8 /tmp/vps_deploy.log" \
    2>/dev/null || true
}

# ── 6. Verify live site ───────────────────────────────────────────────────────
verify_live() {
  log "Verifying https://ana-ca.com is live..."
  sleep 5
  local status
  status=$(curl -sLo /dev/null -w "%{http_code}" --max-time 20 https://ana-ca.com/api/health 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "LIVE ✓ https://ana-ca.com (HTTP $status)"
  else
    warn "Health check returned HTTP $status — DNS may be propagating or SSL may need setup"
    warn "To set up SSL on VPS: certbot --nginx -d ana-ca.com -d www.ana-ca.com --non-interactive --agree-tos -m admin@ana-ca.com"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
validate_env
setup_ssh
push_to_github
upload_env
deploy_on_vps
verify_live

echo ""
ok "All done! https://ana-ca.com"
echo ""
echo "  bash scripts/vps-status.sh   — container health"
echo "  bash scripts/vps-logs.sh     — live backend logs"
echo "  bash scripts/vps-rollback.sh — rollback to previous commit"
