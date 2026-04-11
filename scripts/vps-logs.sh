#!/bin/bash
# =============================================================================
# View live logs from VPS containers
# Usage: bash scripts/vps-logs.sh [backend|db|build|nginx]
# Default: backend (follow mode)
# =============================================================================

TARGET="${1:-backend}"
VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; exit 1; }

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
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=15 -p $VPS_PORT"

echo ""
echo "Streaming logs: $TARGET  (Ctrl+C to stop)"
echo "────────────────────────────────────────────"

case "$TARGET" in
  backend|app)
    log "Following ana-backend logs..."
    $SSH_CMD -t "${VPS_USER}@${VPS_IP}" "docker logs ana-backend -f --tail=100"
    ;;
  db|database)
    log "Following ana-db logs..."
    $SSH_CMD -t "${VPS_USER}@${VPS_IP}" "docker logs ana-db -f --tail=50"
    ;;
  build|deploy)
    log "Showing last deploy build log..."
    $SSH_CMD "${VPS_USER}@${VPS_IP}" "cat /tmp/vps_deploy.log 2>/dev/null || echo 'No deploy log found'"
    ;;
  nginx)
    log "Following nginx access log..."
    $SSH_CMD -t "${VPS_USER}@${VPS_IP}" "tail -f /var/log/nginx/access.log"
    ;;
  nginx-error)
    log "Following nginx error log..."
    $SSH_CMD -t "${VPS_USER}@${VPS_IP}" "tail -f /var/log/nginx/error.log"
    ;;
  *)
    echo "Usage: bash scripts/vps-logs.sh [backend|db|build|nginx|nginx-error]"
    echo "Default: backend"
    exit 1
    ;;
esac
