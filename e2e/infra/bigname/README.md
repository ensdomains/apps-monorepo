# Local bigname for the e2e stack

The manager reads every name from [bigname](https://github.com/ensdomains/bigname)
(#1324). bigname is hosted only, and the hosted Sepolia API cannot see anything
the suite creates on the Anvil fork, so the stack runs its own bigname against
the fork. The portal still reads Panoptes; both run side by side.

| Service            | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `bigname-postgres` | bigname's database (host port 5661 for debugging)                 |
| `bigname-rpc`      | fork-aware JSON-RPC router the runner reads through (fork-rpc.mjs) |
| `bigname-init`     | one-shot `phase-runner init-schema`                               |
| `bigname-roles`    | one-shot read-only login for verification and the API (roles.sql) |
| `bigname-runner`   | `phase-runner run`, following Anvil (runner.sh)                   |
| `bigname-api`      | the REST API on `http://127.0.0.1:5660`                           |

All six are in the compose profile `bigname`. `start-local-env.sh` turns it on
when the image exists, and wipes the database whenever Anvil's fork block
changes. CI does not run bigname; it mocks the manager's reads
(`E2E_MOCK_INDEXER=true`, `e2e/helpers/mock-indexer.ts`).

## Build the image

bigname refuses a Sepolia source that does not start at block 0, which would
mean proxying ~12M blocks through Anvil. The image is built from a branch that
adds a dev-only flag, `BIGNAME_DEV_ALLOW_SEPOLIA_START=1`, lifting that rule
(two files in `apps/phase-runner/src`).

```sh
cd ../bigname                       # your bigname checkout
git switch e2e/anvil-fork-start
docker build --build-arg BIGNAME_BUILD_SHA=$(git rev-parse --short HEAD) \
  -t bigname:e2e-anvil-fork .
```

The first build compiles the whole Rust workspace (about 20 minutes); later
builds reuse the dependency layer. Set `BIGNAME_IMAGE` to use another tag.

## Point the manager at it

```sh
# apps/manager/.env.local
VITE_BIGNAME_API_URL=http://127.0.0.1:5660
```

and leave `E2E_MOCK_INDEXER` unset or `false` in `e2e/.env`, so the manager
specs read the real index. `e2e/helpers/bigname-sync.ts` waits for it after
writes; `makeV2Name` already does.

## Where it starts indexing

`BIGNAME_START` (compose env, default `fork`):

- `fork`: 2,064 blocks below Anvil's fork block (2 x 1,024 slots + 16; the
  verify phase needs Anvil's finalized block above the start). Ready a couple
  of minutes after a new fork. Every name the suite creates is complete.
- `ensv2`: block 11,820,280, just below the 2026-10-01 ENSv2 redeploy, which
  adds every pre-fork ENSv2 registry and name and the Universal Resolver
  cutover (block 11,821,680). Backfilling that through the public upstream RPC
  takes an hour or more.
- a block number.

The runner reads the chain through `bigname-rpc`, not Anvil. A backfill asks
for every header and log in its range; sent to Anvil, each is forwarded to the
upstream RPC one by one, and Anvil stops answering anyone else (measured:
`eth_blockNumber` timing out after 30s). Blocks at or below the fork block are
identical upstream, so the router sends those reads straight there and the
rest to Anvil.

## Limits

- **Reverts.** Anvil runs with `--slots-in-an-epoch 1024`, so its finalized
  block trails the head by 2,048. bigname treats a finalized block that
  disappears as fatal, so an `evm_revert` deeper than 1,024 blocks stops the
  runner. Recover with `bash e2e/infra/scripts/start-local-env.sh` after
  `docker compose -f e2e/infra/docker-compose.yml --profile bigname rm -sfv`
  and removing the `bigname-data` volume.
- **Pre-fork names.** With the default start, names that existed before the
  fork are partial or missing. The suite creates its own names after the fork.
- **Unwrapped ENSv1 labels.** bigname takes `.eth` labels from registrar
  controller events, and no Sepolia controller is admitted for registrations.
  A name minted straight on the BaseRegistrar is labelled only once another
  event carries its label (an ENSv2 reservation, a wrap, a migration).
- **Status.** `/v1/status` may read `degraded` while fully caught up: it
  compares the head block's age with wall time, and Anvil mines on demand.
  Wait on `indexed_block` instead (`scripts/wait-for-bigname.sh`).

## Debug

```sh
docker compose -f e2e/infra/docker-compose.yml --profile bigname logs -f bigname-runner
curl -s http://127.0.0.1:5660/v1/status | python3 -m json.tool
curl -s http://127.0.0.1:5660/v1/names/<name>.eth | python3 -m json.tool
```
