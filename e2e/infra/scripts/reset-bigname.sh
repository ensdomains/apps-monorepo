#!/usr/bin/env bash
# Start the local bigname from an empty database on Anvil's current fork, and
# wait until it follows Anvil live. See e2e/infra/bigname/README.md.
#
# start-local-env.sh calls this when Anvil's fork block changes. Run it by
# hand after changing BIGNAME_START, rebuilding the image, or when the runner
# stopped (an evm_revert deeper than the finalized block, for instance).
#
# Usage: reset-bigname.sh [wait-timeout-seconds]   (default 900)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE=(docker compose -f "$SCRIPT_DIR/../docker-compose.yml" --profile bigname)
SERVICES=(bigname-postgres bigname-rpc bigname-init bigname-roles bigname-runner bigname-api)

fork_block=$(curl -fsS -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"anvil_nodeInfo","params":[]}' \
  http://127.0.0.1:8545 |
  python3 -c "import sys,json; print(json.load(sys.stdin)['result']['forkConfig']['forkBlockNumber'])")

echo "  Resetting bigname for Anvil's fork at block $fork_block"
"${COMPOSE[@]}" rm -sfv "${SERVICES[@]}" >/dev/null 2>&1 || true
docker volume ls -q --filter label=com.docker.compose.volume=bigname-data |
  xargs -r docker volume rm >/dev/null
"${COMPOSE[@]}" up -d "${SERVICES[@]}" >/dev/null 2>&1

until "${COMPOSE[@]}" exec -T bigname-postgres pg_isready -U bigname -d bigname >/dev/null 2>&1; do
  sleep 1
done
# Which fork this database indexes; start-local-env.sh compares it with Anvil.
"${COMPOSE[@]}" exec -T bigname-postgres psql -U bigname -d bigname -qtAc \
  "CREATE TABLE IF NOT EXISTS public.e2e_fork (fork_block bigint);
   DELETE FROM public.e2e_fork;
   INSERT INTO public.e2e_fork VALUES ($fork_block)"

bash "$SCRIPT_DIR/wait-for-bigname.sh" "${1:-900}"
