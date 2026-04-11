#!/bin/bash
# =============================================================================
# Rollback VPS to previous git commit
# Usage: bash scripts/vps-rollback.sh [commit-hash]
# Without commit hash: rolls back to previous commit (HEAD~1)
# =============================================================================
set -e

ROLLBACK_TO="${1:-HEAD~1}"
VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34d'; NC='\033[0m'
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

[ -z "$VPS_SSH_KEY" ] && err "VPS_SSH_KEY secret not set."

export SSH_KEY_PATH="$SSH_KEY"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
node - << 'JSEOF'
const raw = process.env.VPS_SSH_KEY;
const m = raw.match(/(-----BEGIN [^\n-]+ (?:PRIVATE )?KEY-----)([\s\S]*?)(-----END [^\n-]+ (?:PRIVATE )?KEY-----)/);
if (!m) { process.exit(1); }
const body = m[2].replace(/\s+/g, '');
const lines = [];
for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
require('fs').writeFileSync(process.env.SSH_KEY_PATH, m[1]+'\n'+lines.join('\n')+'\n'+m[3]+'\n', { mode: 0o600 });
JSEOF
chmod 600 "$SSH_KEY"
ssh-keyscan -p "$VPS_PORT" -T 10 "$VPS_IP" >> ~/.ssh/known_hosts 2>/dev/null || true
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20 -p $VPS_PORT"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   VPS Rollback → $ROLLBACK_TO"
echo "╚══════════════════════════════════════════════╝"
echo ""
warn "This will rebuild and restart containers from: $ROLLBACK_TO"
echo ""

export ROLLBACK_TARGET="$ROLLBACK_TO"

$SSH_CMD "${VPS_USER}@${VPS_IP}" "bash -s" << REMOTE
APP_DIR=~/firm-hrm
DEPLOY_DIR="\$APP_DIR/deploy"
LOG=/tmp/vps_rollback.log
ROLLBACK_TO="${ROLLBACK_TARGET}"

echo "[VPS] Current: \$(cd \$APP_DIR && git log --oneline -1)"
echo "[VPS] Rolling back to: \$ROLLBACK_TO"
cd "\$APP_DIR"
git fetch origin
git checkout "\$ROLLBACK_TO" 2>/dev/null || git reset --hard "\$ROLLBACK_TO"
echo "[VPS] Now at: \$(git log --oneline -1)"

echo "" > "\$LOG"
nohup bash -c '
  LOG=/tmp/vps_rollback.log
  DEPLOY_DIR=~/firm-hrm/deploy
  cd "\$DEPLOY_DIR"
  echo "[\$(date -u)] Stopping backend..." | tee -a "\$LOG"
  docker compose --env-file .env stop ana-backend >> "\$LOG" 2>&1 || true
  docker compose --env-file .env rm -f ana-backend >> "\$LOG" 2>&1 || true
  echo "[\$(date -u)] Building rolled-back image..." | tee -a "\$LOG"
  docker compose --env-file .env build ana-backend >> "\$LOG" 2>&1
  echo "[\$(date -u)] Starting rolled-back backend..." | tee -a "\$LOG"
  docker compose --env-file .env up -d --force-recreate --no-deps ana-backend >> "\$LOG" 2>&1
  echo "[\$(date -u)] ROLLBACK COMPLETE" | tee -a "\$LOG"
' >> "\$LOG" 2>&1 &
echo "[VPS] Rollback build started in background"
REMOTE

ok "Rollback initiated. Watch with: bash scripts/vps-logs.sh build"
log "Polling for completion..."
for i in $(seq 1 12); do
  sleep 30
  STATUS=$($SSH_CMD "${VPS_USER}@${VPS_IP}" "tail -2 /tmp/vps_rollback.log 2>/dev/null" 2>/dev/null || echo "")
  echo "$STATUS"
  echo "$STATUS" | grep -q "ROLLBACK COMPLETE" && ok "Rollback done!" && break
done
