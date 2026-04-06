#!/bin/bash
# =============================================================================
# Push to GitHub only (no VPS deploy)
# Usage: bash scripts/push.sh ["optional commit message"]
# =============================================================================
set -e

COMMIT_MSG="${1:-Update from Replit $(date '+%Y-%m-%d %H:%M UTC')}"
REPO="${GITHUB_REPO:-aqeelalamfca-sys/firm-hrm}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

[ -z "$GITHUB_TOKEN" ] && err "GITHUB_TOKEN secret is not set in Replit Secrets."

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Replit → GitHub Push               ║"
echo "╚══════════════════════════════════════╝"
echo ""

git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.name  "Replit Deploy"
git config --global user.email "deploy@ana-ca.com"

LOCK_FILE="$(git rev-parse --git-dir)/index.lock"
[ -f "$LOCK_FILE" ] && rm -f "$LOCK_FILE" && warn "Removed stale index.lock"

log "Staging all changes..."
git add -A

if git diff --cached --quiet; then
  warn "Nothing new to commit — pushing current HEAD."
else
  git commit -m "$COMMIT_MSG"
  ok "Committed: $COMMIT_MSG"
fi

log "Pushing to GitHub main..."
git push origin main

echo ""
ok "Pushed → https://github.com/$REPO"
echo ""
echo "To also deploy to VPS:  bash scripts/deploy.sh"
