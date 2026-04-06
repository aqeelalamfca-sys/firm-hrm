#!/bin/bash
# =============================================================================
# Open an interactive SSH shell on the VPS
# Usage: bash scripts/vps-shell.sh
# =============================================================================

VPS_USER="${VPS_USERNAME:-root}"
VPS_IP="${VPS_HOST:-187.77.130.117}"
VPS_PORT="${VPS_PORT:-22}"
SSH_KEY="$HOME/.ssh/vps_deploy"

[ -z "$VPS_SSH_KEY" ] && echo "ERROR: VPS_SSH_KEY secret not set." && exit 1

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

echo ""
echo "Connecting to root@$VPS_IP..."
echo "Useful commands on VPS:"
echo "  docker ps                          — container status"
echo "  docker logs ana-backend -f         — backend logs"
echo "  docker exec -it ana-backend sh     — enter backend container"
echo "  docker exec -it ana-db psql -U ana_user -d ana_hrm  — database shell"
echo "  cd ~/firm-hrm/deploy && docker compose --env-file .env restart ana-backend"
echo ""

exec ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -p "$VPS_PORT" "${VPS_USER}@${VPS_IP}"
