#!/bin/sh
# Entrypoint for the metadata-service container (github.com/ensdomains/metadata-service-v2,
# cloned + pinned at build time — see ../Dockerfile.metadata-service).
#
# Cloudflare Workers have no implicit process.env access, so `wrangler dev`
# only sees vars/secrets it is explicitly given via wrangler.toml [vars] or a
# `.dev.vars` file. Docker Compose `environment:` values land in *this*
# shell's env, not the Worker's — so this script's only job is to bridge the
# two: write `.dev.vars` from the container's environment, then hand off to
# wrangler.
set -eu

cat > .dev.vars <<EOF
MAINNET_RPC_URL=${MAINNET_RPC_URL}
SEPOLIA_RPC_URL=${SEPOLIA_RPC_URL}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
WEBHOOK_TOLERANCE_SECS=${WEBHOOK_TOLERANCE_SECS:-300}
RATE_LIMIT_DISABLED=${RATE_LIMIT_DISABLED:-true}
ENSNODE_MAINNET_URL=${ENSNODE_MAINNET_URL}
ENSNODE_SEPOLIA_V2_URL=${ENSNODE_SEPOLIA_V2_URL}
ENSNODE_SEPOLIA_V1_URL=${ENSNODE_SEPOLIA_V1_URL}
LOG_LEVEL=${LOG_LEVEL:-info}
EOF

# Font seeding for the /rasterize PNG route (src/scripts/setup-local-r2.mjs).
# Best-effort: the Satoshi-Bold.ttf source lives in a sibling `canvas-cf`
# checkout upstream doesn't ship here, so this step degrades the rasterize
# route rather than blocking the rest of the service — every other route
# (metadata JSON, SVG image, avatar/header) does not depend on it.
node scripts/setup-local-r2.mjs || echo "[metadata-service] font seeding incomplete — /rasterize may 500, all other routes unaffected"

# D1 schema — local Miniflare SQLite, wiped fresh on every container start.
yarn db:migrate:local

exec yarn wrangler dev --ip 0.0.0.0 --port 8787
