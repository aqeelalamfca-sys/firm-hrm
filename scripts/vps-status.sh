#!/bin/bash
# =============================================================================
# Check live status of VPS containers and services
# Usage: bash scripts/vps-status.sh
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

[ -z "$VPS_SSH_PRIVATE_KEY" ] && err "VPS_SSH_PRIVATE_KEY secret not set."

# Write SSH key
export SSH_KEY_PATH="$SSH_KEY"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
node - << 'JSEOF'
const raw = process.env.VPS_SSH_PRIVATE_KEY;
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
echo "╔══════════════════════════════════════════════════╗"
echo "║   VPS Status — ana-ca.com (187.77.130.117)       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

log "Fetching container status..."
$SSH_CMD "${VPS_USER}@${VPS_IP}" << 'REMOTE'
echo "── Docker Containers ────────────────────────────────"
docker ps --filter "name=ana-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  No containers running"

echo ""
echo "── Resource Usage ────────────────────────────────────"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || true

echo ""
echo "── Nginx Status ──────────────────────────────────────"
systemctl is-active nginx 2>/dev/null && echo "  nginx: ACTIVE" || echo "  nginx: STOPPED"

echo ""
echo "── SSL Certificate ───────────────────────────────────"
certbot certificates 2>/dev/null | grep -E "Domains|Expiry|Status" | sed 's/^/  /' || echo "  No certificates found"

echo ""
echo "── Disk Usage ────────────────────────────────────────"
df -h / | tail -1 | awk '{print "  Used: " $3 " / " $2 " (" $5 " full)"}'

echo ""
echo "── Backend Health ────────────────────────────────────"
curl -sL --max-time 5 http://localhost:5002/api/health 2>/dev/null && echo "" || echo "  ERROR: backend not responding on :5002"

echo ""
echo "── Last Deploy Log ───────────────────────────────────"
tail -8 /tmp/vps_deploy.log 2>/dev/null || echo "  No deploy log found"
REMOTE

echo ""
log "Checking live site..."
STATUS=$(curl -sLo /dev/null -w "%{http_code}" --max-time 10 https://ana-ca.com/api/health 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  ok "https://ana-ca.com → HTTP $STATUS ✓"
else
  warn "https://ana-ca.com → HTTP $STATUS"
fi
