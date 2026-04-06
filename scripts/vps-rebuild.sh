#!/bin/bash
# =============================================================================
# Force full rebuild and restart on VPS (no code pull, use current code)
# Usage: bash scripts/vps-rebuild.sh
# =============================================================================
set -e

VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

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
echo "╔══════════════════════════════════════╗"
echo "║   VPS Full Rebuild & Restart         ║"
echo "╚══════════════════════════════════════╝"
echo ""

$SSH_CMD "${VPS_USER}@${VPS_IP}" << 'REMOTE'
LOG=/tmp/vps_rebuild.log
echo "" > "$LOG"
nohup bash -c '
  LOG=/tmp/vps_rebuild.log
  DEPLOY_DIR=~/firm-hrm/deploy
  cd "$DEPLOY_DIR"
  echo "[$(date -u)] === REBUILD START ===" | tee -a "$LOG"
  docker compose --env-file .env down --remove-orphans >> "$LOG" 2>&1 || true
  docker compose --env-file .env build --no-cache ana-backend >> "$LOG" 2>&1
  docker compose --env-file .env up -d >> "$LOG" 2>&1
  echo "[$(date -u)] === REBUILD COMPLETE ===" | tee -a "$LOG"
' >> "$LOG" 2>&1 &
echo "Rebuild started (PID $!). Monitor: tail -f /tmp/vps_rebuild.log"
REMOTE

ok "Rebuild kicked off on VPS"
log "Polling..."
for i in $(seq 1 14); do
  sleep 30
  STATUS=$($SSH_CMD "${VPS_USER}@${VPS_IP}" "tail -2 /tmp/vps_rebuild.log 2>/dev/null" 2>/dev/null || echo "")
  echo "$STATUS"
  echo "$STATUS" | grep -q "REBUILD COMPLETE" && ok "Rebuild done!" && break
done

log "Container status:"
$SSH_CMD "${VPS_USER}@${VPS_IP}" \
  "docker ps --filter 'name=ana-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null || true
