#!/bin/sh
# Runs the Panoptes indexer (background) and GraphQL API (foreground) in one
# container so they share the sqlite database without a shared volume —
# Railway volumes are single-service. If either process dies, the container
# exits and Railway's restart policy brings both back up together.
set -e

mkdir -p /app/data

echo "[railway-entrypoint] starting indexer..."
/app/ensv2-indexer-v2 &
INDEXER_PID=$!

# Give the indexer a moment to create the database before the API opens it.
sleep 5

echo "[railway-entrypoint] starting API..."
/app/api-entrypoint.sh &
API_PID=$!

# Exit if either process exits, so Railway restarts the pair together.
wait -n "$INDEXER_PID" "$API_PID" 2>/dev/null || wait "$API_PID"
echo "[railway-entrypoint] a process exited; shutting down container"
kill "$INDEXER_PID" "$API_PID" 2>/dev/null || true
exit 1
