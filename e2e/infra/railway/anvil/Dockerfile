# Anvil (Sepolia fork) for Railway PR environments.
#
# The upstream foundry image's entrypoint is "/bin/sh -c", which mangles
# list-style commands (docker-compose overrides it too). Railway's custom
# start command hits the same quirk — the container exits 0 instead of
# running anvil. This wrapper pins a deterministic entrypoint instead.
#
# Binds [::]: a dual-stack socket accepts both IPv6 and IPv4, covering
# Railway private networking and the public proxy with one flag.
#
# NOTE: fork mode (live Sepolia). Once the ens-v2-snapshot image is rebuilt
# with current contracts, switch the service back to that image (see
# ../README.md) — snapshot needs no upstream RPC and boots in seconds.
#
# Railway service settings:
#   Root Directory:  e2e/infra
#   Dockerfile Path: railway/anvil/Dockerfile
#   Variables:       SEPOLIA_FORK_URL=<sepolia rpc url>
FROM ghcr.io/foundry-rs/foundry:latest

EXPOSE 8545

ENTRYPOINT ["/bin/sh", "-c", "exec anvil --fork-url \"$SEPOLIA_FORK_URL\" --chain-id 11155111 --port 8545 --host ::"]
