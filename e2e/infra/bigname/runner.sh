#!/bin/sh
# Starts bigname's phase-runner against the Anvil fork.
#
# bigname normally refuses a Sepolia source that does not start at block 0;
# the e2e image carries a dev-only flag (BIGNAME_DEV_ALLOW_SEPOLIA_START=1)
# that lifts it, so the runner can follow the fork from a recent block
# instead of proxying ~12M blocks through Anvil to the upstream RPC.
#
# BIGNAME_START picks that block:
#   fork (default)   2 * SLOTS + 16 below Anvil's fork block: a couple of
#                    minutes, and every name the suite creates is complete
#   ensv2            just below the 2026-10-01 ENSv2 redeploy, so every ENSv2
#                    registry, name and the Universal Resolver cutover
#                    (block 11,821,680) are indexed too; an hour or more of
#                    backfill through the public upstream RPC
#   <number>         that block
#
# The start is part of the runner's stored source identity, so a new fork
# needs a fresh database: start-local-env.sh wipes it with Anvil.
set -eu

: "${ANVIL_RPC_URL:=http://anvil:8545}"
# Where the runner reads the chain: fork-rpc.mjs, which keeps the backfill off
# Anvil. Anvil itself answers the fork-block question below.
: "${SOURCE_RPC_URL:=$ANVIL_RPC_URL}"
: "${BIGNAME_START:=fork}"
: "${ANVIL_SLOTS_IN_AN_EPOCH:=1024}"
ENSV2_FLOOR=11820280

rpc() {
  curl -fsS -X POST -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":[]}" \
    "$ANVIL_RPC_URL"
}

fork_block=$(rpc anvil_nodeInfo | sed -n 's/.*"forkBlockNumber":\([0-9]*\).*/\1/p')
if [ -z "$fork_block" ]; then
  echo "[bigname] Anvil reports no fork block; is it running with --fork-url?" >&2
  exit 1
fi

case "$BIGNAME_START" in
  ensv2) start=$ENSV2_FLOOR ;;
  fork) start=$((fork_block - 2 * ANVIL_SLOTS_IN_AN_EPOCH - 16)) ;;
  *) start=$BIGNAME_START ;;
esac

# Verify runs up to Anvil's finalized block (latest - 2 * slots); a start above
# it fails with "verification target ... below scan start".
finalized=$((fork_block - 2 * ANVIL_SLOTS_IN_AN_EPOCH))
if [ "$start" -gt "$finalized" ]; then
  echo "[bigname] start $start is above the finalized block $finalized" >&2
  exit 1
fi

echo "[bigname] fork block $fork_block, indexing from $start"
export BIGNAME_PHASE_RUNNER_SOURCES="ethereum-sepolia:anvil:drpc:ethereum_head:${start}=SOURCE_RPC_URL"
export SOURCE_RPC_URL
exec phase-runner run
