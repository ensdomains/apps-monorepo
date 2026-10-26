# Local bigname for the e2e stack

> Overview of the whole local stack, and of mock vs real index and online vs
> offline network: [`e2e/docs/local-e2e-stack.md`](../../docs/local-e2e-stack.md).

The manager reads every name from [bigname](https://github.com/ensdomains/bigname)
(#1324). bigname is hosted only, and the hosted Sepolia API cannot see anything
the suite creates on the Anvil fork, so the stack runs its own bigname against
the fork. Both apps read it.

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
identical upstream, so the router sends those reads straight there (through
its disk cache) and the rest to Anvil. Transaction lookups go to Anvil first:
asking upstream first cost a public request per test transaction.

## Running without a public RPC

The fork is pinned (`e2e/infra/fork-block`, read by `start-local-env.sh`), and
every read that has to leave the machine is cached on disk:

- **Anvil** forks through `upstream-cache` (`upstream-cache.mjs`), a caching
  proxy in front of `SEPOLIA_FORK_URL`. At a pinned block every upstream read
  names that block (the fork header, code, storage, balances), so each answer
  is kept on the `anvil-upstream-cache` volume and never asked again; with
  `--fork-chain-id` Anvil then starts and runs with the upstream unreachable.
  Anvil's own `storage.json` cache (`anvil-fork-cache`, written on SIGINT) is
  kept too, but on its own it cannot start Anvil offline: Anvil still fetches
  the fork block's header.
- **bigname-rpc** caches every upstream answer (blocks, logs and
  transactions at or below the fork, which never change) on the
  `bigname-rpc-cache` volume.

The first run against a new pin is online and slower; it warms both caches.
After that the stack needs no public RPC for anything a previous run touched.
To prove it, start with no reachable upstream and the router refusing to ask:

```sh
SEPOLIA_FORK_URL=http://127.0.0.1:9 BIGNAME_UPSTREAM_RPC_URL=http://127.0.0.1:9 \
  FORK_RPC_OFFLINE=1 bash e2e/infra/scripts/start-local-env.sh
docker compose -f e2e/infra/docker-compose.yml --profile bigname logs bigname-rpc | grep cache:
```

`FORK_RPC_OFFLINE=1` puts both caches in refuse mode: a miss is an error,
visible in their logs (`[upstream-cache] … misses`, `[fork-rpc] cache: …`) and
in Anvil's (`no cached answer for …`), rather than a request.

**Moving the pin** (after an ENS redeploy on Sepolia, or when you need newer
Sepolia state): write the new block to `e2e/infra/fork-block`, run online once
to warm the caches, and commit the file. `SEPOLIA_FORK_BLOCK=latest` forks the
tip for a one-off run.

**Chain clock.** A pinned fork starts at its block's timestamp. On a fresh
chain `start-local-env.sh` steps the clock forward to the wall clock (never
back), because intents and sessions are dated by the wall clock. A restarted
Anvil (new start time) also resets bigname, since the same fork block no longer
identifies the chain.

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

## Replacement-parity runs

Use `BIGNAME_START=ensv2` for replacement-parity testing. Starting near the fork
can omit the root `.eth` registry entry: V1 descendant records then resolve on
chain while the indexer incorrectly reports `ens_v2_path_no_resolver`.
Before testing, require the published head to catch up **and** verify that
`project_ens_v2_entry_owner` contains the root registry entry.

The compose file exposes optional capacity settings without changing defaults:
`BIGNAME_INGEST_BLOCKS_PER_BATCH` (256), `BIGNAME_INGEST_RPC_BATCH_SIZE` (32),
`BIGNAME_INGEST_RPC_MAX_IN_FLIGHT` (8), and `BIGNAME_UPSTREAM_IN_FLIGHT` (6).
A batch size of 1 makes the runner send standalone RPC calls. Match these to
an archive provider that returns old headers, logs **and receipts**; a successful
chain-ID or header request alone does not establish archival coverage.

Long local runs also need enough Docker VM memory. A replacement-parity run
was OOM-killed with a 16 GiB VM; the rebuild uses 48 GiB on a 128 GiB host.
Monitor Anvil memory between batches, keep chain-mutating tests serial, and
stop on chain failure rather than treating connection errors as app failures.

The fork RPC router remembers transaction hashes returned in historical logs or
headers and sends their receipt/transaction reads directly upstream. This avoids
Anvil fetching entire historical transaction blocks during backfill. Unknown
hashes still go to Anvil first so newly mined test transactions stay local.
Verify the routing boundary with `node --test e2e/infra/bigname/fork-rpc.test.mjs`.
