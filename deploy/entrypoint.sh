#!/bin/sh
set -e

echo "[Entrypoint] Waiting for database..."
RETRIES=30
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "[Entrypoint] DB not reachable after 30 attempts — starting anyway"
    break
  fi
  sleep 2
done

echo "[Entrypoint] Running DB schema sync (drizzle-kit push)..."
cd /app/db
DATABASE_URL="$DATABASE_URL" /app/node_modules/.bin/drizzle-kit push \
  --config ./drizzle.config.ts --force 2>&1 && \
  echo "[Entrypoint] Schema sync complete" || \
  echo "[Entrypoint] Schema sync warning — continuing startup"

echo "[Entrypoint] Starting application..."
exec node --enable-source-maps /app/dist/index.mjs
