#!/bin/sh
set -e

# Apply any pending database migrations before the API starts, so a fresh
# Postgres gets its tables and an update gets its schema changes
# automatically. Safe to run on every start: already-applied migrations are
# skipped.
echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting FlexiTrack API..."
# exec: node becomes PID 1 and receives Docker's SIGTERM directly, so the
# graceful shutdown in src/index.js (finish in-flight requests and
# scheduler ticks) runs on `docker compose down` / restart.
exec node src/index.js
